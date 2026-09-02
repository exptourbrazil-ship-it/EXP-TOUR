// Servico de ESCRITA MANUAL de tabelas de preco pela Area Administrativa
// (price_template + price_tier + price_template_product). SERVER-ONLY (service
// role). Complementa price-admin-service.ts (que materializa o price list da
// ESCOLA): aqui o Admin cria/edita uma tabela do zero.
//
// POSSE: tudo escopado pelo tenant. O template pendura num campus (campus_id
// NOT NULL) que tem que ser do tenant; os produtos vinculados tem que ser do
// tenant E do MESMO campus; o market (se houver) tem que ser do tenant.
//
// FRONTEIRA com o fluxo da escola: as tabelas MANUAIS nascem com
// source_submission_id = NULL (o supersede da escola nunca as expira). Este
// service SO edita/arquiva tabelas manuais — recusa mexer numa tabela gerida por
// price list (source_submission_id != NULL), que pertence ao fluxo de aprovacao.
import type { SupabaseClient } from "@supabase/supabase-js";
import { validarTabelaPreco, type Falha } from "@/lib/preco-template";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";

export class PrecoAdminErro extends Error {
  constructor(
    public codigo:
      | "validacao"
      | "campus_invalido"
      | "produto_invalido"
      | "market_invalido"
      | "template_nao_encontrado"
      | "template_gerido"
      | "falha_persistir",
    public falhas?: Falha[],
  ) {
    super(codigo);
    this.name = "PrecoAdminErro";
  }
}

async function campusDoTenant(supabase: SupabaseClient, tenantId: string, campusId: string): Promise<boolean> {
  const { data } = await supabase.from("campus").select("id, tenant_id").eq("id", campusId).maybeSingle();
  return !!data && (data as { tenant_id?: string }).tenant_id === tenantId;
}

async function marketDoTenant(supabase: SupabaseClient, tenantId: string, marketId: string): Promise<boolean> {
  const { data } = await supabase.from("market").select("id, tenant_id").eq("id", marketId).maybeSingle();
  return !!data && (data as { tenant_id?: string }).tenant_id === tenantId;
}

// Confere que TODOS os produtos sao do tenant E do mesmo campus do template.
async function produtosDoTenantECampus(
  supabase: SupabaseClient,
  tenantId: string,
  campusId: string,
  ids: string[],
): Promise<boolean> {
  const unicos = Array.from(new Set(ids));
  if (unicos.length === 0) return false;
  const { data } = await supabase
    .from("product")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("campus_id", campusId)
    .is("archived_at", null) // so produto vivo pode ser vinculado
    .in("id", unicos);
  return (data?.length ?? 0) === unicos.length;
}

export type SalvarTabelaArgs = {
  tenantId: string;
  actor: string;
  ip?: string | null;
  templateId?: string | null; // ausente = criar; presente = editar
  entrada: unknown;
};

// Cria ou edita uma tabela de preco manual (template + faixas + vinculo a
// produtos) e grava a trilha. Devolve o id do template.
export async function salvarTabelaPreco(
  supabase: SupabaseClient,
  args: SalvarTabelaArgs,
): Promise<{ id: string; criado: boolean }> {
  const { tenantId, actor, ip, templateId } = args;

  const r = validarTabelaPreco(args.entrada);
  if (!r.ok) throw new PrecoAdminErro("validacao", r.falhas);
  const { template, tiers, product_ids } = r.valor;

  // Posse: campus do tenant.
  if (!(await campusDoTenant(supabase, tenantId, template.campus_id))) {
    throw new PrecoAdminErro("campus_invalido");
  }
  // Posse: market (se informado) do tenant.
  if (template.market_id && !(await marketDoTenant(supabase, tenantId, template.market_id))) {
    throw new PrecoAdminErro("market_invalido");
  }
  // Posse: produtos do tenant E do mesmo campus.
  if (!(await produtosDoTenantECampus(supabase, tenantId, template.campus_id, product_ids))) {
    throw new PrecoAdminErro("produto_invalido");
  }

  const linhaTemplate = {
    tenant_id: tenantId,
    campus_id: template.campus_id,
    name: template.name,
    price_basis: template.price_basis,
    duration_type: template.duration_type,
    unit: template.unit,
    currency: template.currency,
    min_quantity: template.min_quantity,
    max_quantity: template.max_quantity,
    charge_in_tiers: template.charge_in_tiers,
    market_id: template.market_id,
    valid_from: template.valid_from,
    valid_until: template.valid_until,
    status: template.status,
  };

  let id: string;
  let criado: boolean;

  if (templateId) {
    // Edicao: tem que ser do tenant E manual (source_submission_id NULL). Nao
    // mexemos em tabela gerida por price list (pertence ao fluxo da escola).
    // Carrega a linha INTEIRA para servir de snapshot de restauracao.
    const { data: existente } = await supabase
      .from("price_template")
      .select("*")
      .eq("id", templateId)
      .maybeSingle();
    if (!existente || (existente as { tenant_id?: string }).tenant_id !== tenantId) {
      throw new PrecoAdminErro("template_nao_encontrado");
    }
    if ((existente as { source_submission_id?: string | null }).source_submission_id != null) {
      throw new PrecoAdminErro("template_gerido");
    }

    // Snapshot de faixas/vinculos ANTES de qualquer escrita destrutiva. Sem
    // transacao no PostgREST, e o que permite reverter uma falha parcial.
    const snap = await snapshotFaixasEVinculos(supabase, templateId);

    const { data: upd, error } = await supabase
      .from("price_template")
      .update({ ...linhaTemplate, updated_at: new Date().toISOString() })
      .eq("id", templateId)
      .eq("tenant_id", tenantId)
      .is("source_submission_id", null) // guarda extra: nunca vira uma gerida
      .select("id");
    if (error) {
      console.error("[precos] atualizar template:", error.message);
      throw new PrecoAdminErro("falha_persistir");
    }
    // 0 linhas = corrida (arquivada/gerida entre o SELECT e o UPDATE): nada foi
    // destruido ainda, entao so recusamos.
    if (!upd || upd.length === 0) throw new PrecoAdminErro("template_nao_encontrado");
    id = templateId;
    criado = false;

    // Substitui faixas/vinculos; numa falha parcial, RESTAURA o estado anterior
    // (colunas + faixas + vinculos) — nao deixa uma tabela ativa sem preco.
    try {
      await persistirFaixasEVinculos(supabase, id, tiers, product_ids);
    } catch (e) {
      await restaurarTabela(supabase, existente as Record<string, unknown>, snap);
      throw e;
    }
  } else {
    const { data, error } = await supabase
      .from("price_template")
      .insert({ ...linhaTemplate, source_submission_id: null })
      .select("id")
      .single();
    if (error || !data) {
      if (error) console.error("[precos] criar template:", error.message);
      throw new PrecoAdminErro("falha_persistir");
    }
    id = (data as { id: string }).id;
    criado = true;

    // Compensa (apaga o template recem-criado) se faixas/vinculos falharem — nao
    // deixa template orfao sem preco. A propria compensacao e best-effort: loga.
    try {
      await persistirFaixasEVinculos(supabase, id, tiers, product_ids);
    } catch (e) {
      const { error: eComp } = await supabase.from("price_template").delete().eq("id", id).eq("tenant_id", tenantId);
      if (eComp) console.error("[precos] compensacao (apagar template orfao) falhou:", eComp.message);
      throw e;
    }
  }

  await registrarAuditoriaAdmin(supabase, {
    usuario: actor,
    acao: criado ? "preco.tabela.criar" : "preco.tabela.editar",
    alvo: id,
    detalhe: { name: template.name, currency: template.currency, status: template.status, faixas: tiers.length, produtos: product_ids.length },
    ip: ip ?? null,
  });

  return { id, criado };
}

type SnapshotTabela = {
  tiers: { min_quantity: number; unit_price: number; sort: number }[];
  productIds: string[];
};

// Le o estado atual de faixas + vinculos de um template (para restaurar em caso
// de falha parcial no update, ja que o PostgREST nao da transacao).
async function snapshotFaixasEVinculos(supabase: SupabaseClient, templateId: string): Promise<SnapshotTabela> {
  const { data: tiers } = await supabase
    .from("price_tier")
    .select("min_quantity, unit_price, sort")
    .eq("price_template_id", templateId);
  const { data: vinc } = await supabase
    .from("price_template_product")
    .select("product_id")
    .eq("price_template_id", templateId);
  return {
    tiers: (tiers ?? []).map((t: any) => ({ min_quantity: t.min_quantity, unit_price: Number(t.unit_price), sort: t.sort })),
    productIds: (vinc ?? []).map((v: any) => v.product_id),
  };
}

// Restaura (best-effort) as colunas do template + faixas + vinculos a partir do
// snapshot. NUNCA lanca — o erro original da mutacao e que deve propagar; aqui so
// tentamos nao deixar o estado corrompido, logando o que falhar.
async function restaurarTabela(
  supabase: SupabaseClient,
  linhaAnterior: Record<string, unknown>,
  snap: SnapshotTabela,
): Promise<void> {
  const id = linhaAnterior.id as string;
  try {
    await supabase
      .from("price_template")
      .update({
        campus_id: linhaAnterior.campus_id,
        name: linhaAnterior.name,
        price_basis: linhaAnterior.price_basis,
        duration_type: linhaAnterior.duration_type,
        unit: linhaAnterior.unit,
        currency: linhaAnterior.currency,
        min_quantity: linhaAnterior.min_quantity,
        max_quantity: linhaAnterior.max_quantity,
        charge_in_tiers: linhaAnterior.charge_in_tiers,
        market_id: linhaAnterior.market_id,
        valid_from: linhaAnterior.valid_from,
        valid_until: linhaAnterior.valid_until,
        status: linhaAnterior.status,
        updated_at: linhaAnterior.updated_at ?? null,
      })
      .eq("id", id);
    await supabase.from("price_tier").delete().eq("price_template_id", id);
    if (snap.tiers.length > 0) {
      await supabase.from("price_tier").insert(snap.tiers.map((t) => ({ price_template_id: id, ...t })));
    }
    await supabase.from("price_template_product").delete().eq("price_template_id", id);
    if (snap.productIds.length > 0) {
      await supabase.from("price_template_product").insert(snap.productIds.map((pid) => ({ price_template_id: id, product_id: pid })));
    }
  } catch (err) {
    console.error("[precos] restauracao apos falha parcial falhou:", err instanceof Error ? err.message : err);
  }
}

async function persistirFaixasEVinculos(
  supabase: SupabaseClient,
  templateId: string,
  tiers: { min_quantity: number; unit_price: number; sort: number }[],
  productIds: string[],
): Promise<void> {
  // Faixas.
  const { error: eDelT } = await supabase.from("price_tier").delete().eq("price_template_id", templateId);
  if (eDelT) {
    console.error("[precos] limpar faixas:", eDelT.message);
    throw new PrecoAdminErro("falha_persistir");
  }
  const { error: eTier } = await supabase
    .from("price_tier")
    .insert(tiers.map((t) => ({ price_template_id: templateId, min_quantity: t.min_quantity, unit_price: t.unit_price, sort: t.sort })));
  if (eTier) {
    console.error("[precos] inserir faixas:", eTier.message);
    throw new PrecoAdminErro("falha_persistir");
  }
  // Vinculos template<->produto.
  const { error: eDelV } = await supabase.from("price_template_product").delete().eq("price_template_id", templateId);
  if (eDelV) {
    console.error("[precos] limpar vínculos:", eDelV.message);
    throw new PrecoAdminErro("falha_persistir");
  }
  const { error: eVinc } = await supabase
    .from("price_template_product")
    .insert(productIds.map((pid) => ({ price_template_id: templateId, product_id: pid })));
  if (eVinc) {
    console.error("[precos] inserir vínculos:", eVinc.message);
    throw new PrecoAdminErro("falha_persistir");
  }
}

// Arquiva (expira) uma tabela manual do tenant. Marca status='expired' (o motor
// so seleciona 'active') e archived_at. Recusa tabela gerida por price list.
export async function arquivarTabelaPreco(
  supabase: SupabaseClient,
  args: { tenantId: string; actor: string; ip?: string | null; templateId: string },
): Promise<void> {
  const { tenantId, actor, ip, templateId } = args;
  const { data: existente } = await supabase
    .from("price_template")
    .select("id, tenant_id, source_submission_id")
    .eq("id", templateId)
    .maybeSingle();
  if (!existente || (existente as { tenant_id?: string }).tenant_id !== tenantId) {
    throw new PrecoAdminErro("template_nao_encontrado");
  }
  if ((existente as { source_submission_id?: string | null }).source_submission_id != null) {
    throw new PrecoAdminErro("template_gerido");
  }
  const { data: upd, error } = await supabase
    .from("price_template")
    .update({ status: "expired", archived_at: new Date().toISOString() })
    .eq("id", templateId)
    .eq("tenant_id", tenantId)
    .is("source_submission_id", null)
    .select("id");
  if (error) {
    console.error("[precos] arquivar template:", error.message);
    throw new PrecoAdminErro("falha_persistir");
  }
  // 0 linhas = corrida (virou gerida/arquivada entre o SELECT e o UPDATE).
  if (!upd || upd.length === 0) throw new PrecoAdminErro("template_nao_encontrado");
  await registrarAuditoriaAdmin(supabase, { usuario: actor, acao: "preco.tabela.arquivar", alvo: templateId, ip: ip ?? null });
}

// ── Leituras para a UI admin ────────────────────────────────────────────────

export type TabelaPrecoLista = {
  id: string;
  name: string;
  status: string;
  currency: string;
  unit: string;
  priceBasis: string;
  campusId: string;
  campusName: string | null;
  validFrom: string;
  validUntil: string | null;
  gerida: boolean; // true = veio de price list da escola (só leitura aqui)
  faixas: number;
  produtos: number;
  updatedAt: string | null;
};

// Lista as tabelas de preco do tenant (nao arquivadas), com campus e contagens.
export async function listarTabelasPrecoAdmin(
  supabase: SupabaseClient,
  tenantId: string,
  filtro?: { campusId?: string },
): Promise<TabelaPrecoLista[]> {
  let q = supabase
    .from("price_template")
    .select(
      "id, name, status, currency, unit, price_basis, campus_id, valid_from, valid_until, source_submission_id, updated_at, campus:campus(name), tiers:price_tier(count), vinculos:price_template_product(count)",
    )
    .eq("tenant_id", tenantId)
    .is("archived_at", null)
    .order("updated_at", { ascending: false, nullsFirst: false })
    .order("name");
  if (filtro?.campusId) q = q.eq("campus_id", filtro.campusId);
  const { data } = await q;
  return (data ?? []).map((t: any) => {
    const campus = Array.isArray(t.campus) ? t.campus[0] : t.campus;
    const faixas = Array.isArray(t.tiers) ? (t.tiers[0]?.count ?? 0) : 0;
    const produtos = Array.isArray(t.vinculos) ? (t.vinculos[0]?.count ?? 0) : 0;
    return {
      id: t.id,
      name: t.name,
      status: t.status,
      currency: t.currency,
      unit: t.unit,
      priceBasis: t.price_basis,
      campusId: t.campus_id,
      campusName: campus?.name ?? null,
      validFrom: t.valid_from,
      validUntil: t.valid_until ?? null,
      gerida: t.source_submission_id != null,
      faixas,
      produtos,
      updatedAt: t.updated_at ?? null,
    };
  });
}

// Carrega uma tabela do tenant COM faixas e product_ids (para o editor). Retorna
// null se nao for do tenant. `gerida` indica se veio de price list (só leitura).
export async function obterTabelaPrecoAdmin(
  supabase: SupabaseClient,
  tenantId: string,
  templateId: string,
): Promise<{ template: Record<string, unknown>; tiers: unknown[]; product_ids: string[]; gerida: boolean } | null> {
  const { data: tpl } = await supabase
    .from("price_template")
    .select("*")
    .eq("id", templateId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!tpl) return null;

  const { data: tiers } = await supabase
    .from("price_tier")
    .select("min_quantity, unit_price, sort")
    .eq("price_template_id", templateId)
    .order("min_quantity");
  const { data: vinc } = await supabase
    .from("price_template_product")
    .select("product_id")
    .eq("price_template_id", templateId);

  return {
    template: tpl as Record<string, unknown>,
    tiers: tiers ?? [],
    product_ids: (vinc ?? []).map((v: any) => v.product_id),
    gerida: (tpl as { source_submission_id?: string | null }).source_submission_id != null,
  };
}

// Mercados do tenant (para o seletor do editor).
export async function listarMarketsDoTenant(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<{ id: string; name: string }[]> {
  const { data } = await supabase.from("market").select("id, name").eq("tenant_id", tenantId).is("archived_at", null).order("name");
  return (data ?? []).map((m: any) => ({ id: m.id, name: m.name }));
}
