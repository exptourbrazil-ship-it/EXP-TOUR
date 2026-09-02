// Servico de ESCRITA MANUAL de TAXAS (fee + fee_product) pela Area Administrativa.
// SERVER-ONLY (service role). Complementa price-admin-service.ts (que materializa
// as taxas do price list da ESCOLA): aqui o Admin cria/edita uma taxa a mao.
//
// POSSE: tudo escopado pelo tenant. A taxa pendura num campus (campus_id NOT NULL)
// do tenant; os produtos vinculados (fee_product) tem que ser do tenant E do
// mesmo campus; a tabela de preco (modo derivado) tem que ser do tenant E do
// mesmo campus.
//
// FRONTEIRA com o fluxo da escola: as taxas MANUAIS nascem com
// source_submission_id = NULL (o supersede da escola nunca as expira). Este
// service SO edita/arquiva taxas manuais — recusa mexer numa taxa gerida por
// price list (source_submission_id != NULL).
import type { SupabaseClient } from "@supabase/supabase-js";
import { validarTaxa, type Falha } from "@/lib/fee";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";

export class TaxaAdminErro extends Error {
  constructor(
    public codigo:
      | "validacao"
      | "campus_invalido"
      | "produto_invalido"
      | "template_invalido"
      | "taxa_nao_encontrada"
      | "taxa_gerida"
      | "falha_persistir",
    public falhas?: Falha[],
  ) {
    super(codigo);
    this.name = "TaxaAdminErro";
  }
}

async function campusDoTenant(supabase: SupabaseClient, tenantId: string, campusId: string): Promise<boolean> {
  const { data } = await supabase.from("campus").select("id, tenant_id").eq("id", campusId).maybeSingle();
  return !!data && (data as { tenant_id?: string }).tenant_id === tenantId;
}

// A tabela de preco (modo derivado) tem que ser do tenant E do mesmo campus.
async function templateDoTenantECampus(
  supabase: SupabaseClient,
  tenantId: string,
  campusId: string,
  templateId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("price_template")
    .select("id, tenant_id, campus_id")
    .eq("id", templateId)
    .is("archived_at", null) // nao derivar valor de tabela arquivada
    .maybeSingle();
  return (
    !!data &&
    (data as { tenant_id?: string }).tenant_id === tenantId &&
    (data as { campus_id?: string }).campus_id === campusId
  );
}

// Todos os produtos do tenant E do mesmo campus (e vivos).
async function produtosDoTenantECampus(
  supabase: SupabaseClient,
  tenantId: string,
  campusId: string,
  ids: string[],
): Promise<boolean> {
  const unicos = Array.from(new Set(ids));
  if (unicos.length === 0) return true; // vinculo por produto e opcional (alvo pode ser so por kind)
  const { data } = await supabase
    .from("product")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("campus_id", campusId)
    .is("archived_at", null)
    .in("id", unicos);
  return (data?.length ?? 0) === unicos.length;
}

export type SalvarTaxaArgs = {
  tenantId: string;
  actor: string;
  ip?: string | null;
  feeId?: string | null; // ausente = criar; presente = editar
  entrada: unknown;
};

// Cria ou edita uma taxa manual (fee + vinculo fee_product) e grava a trilha.
export async function salvarTaxa(
  supabase: SupabaseClient,
  args: SalvarTaxaArgs,
): Promise<{ id: string; criado: boolean }> {
  const { tenantId, actor, ip, feeId } = args;

  const r = validarTaxa(args.entrada);
  if (!r.ok) throw new TaxaAdminErro("validacao", r.falhas);
  const { fee, product_ids } = r.valor;

  // Posse: campus do tenant.
  if (!(await campusDoTenant(supabase, tenantId, fee.campus_id))) {
    throw new TaxaAdminErro("campus_invalido");
  }
  // Posse: tabela de preco (modo derivado) do tenant E mesmo campus.
  if (fee.price_template_id && !(await templateDoTenantECampus(supabase, tenantId, fee.campus_id, fee.price_template_id))) {
    throw new TaxaAdminErro("template_invalido");
  }
  // Posse: produtos vinculados do tenant E mesmo campus.
  if (!(await produtosDoTenantECampus(supabase, tenantId, fee.campus_id, product_ids))) {
    throw new TaxaAdminErro("produto_invalido");
  }

  const linha = {
    tenant_id: tenantId,
    campus_id: fee.campus_id,
    name: fee.name,
    fee_type: fee.fee_type,
    charge_basis: fee.charge_basis,
    amount: fee.amount,
    currency: fee.currency,
    price_template_id: fee.price_template_id,
    is_refundable: fee.is_refundable,
    is_mandatory: fee.is_mandatory,
    applies_to_kinds: fee.applies_to_kinds,
    valid_from: fee.valid_from,
    valid_until: fee.valid_until,
  };

  let id: string;
  let criado: boolean;

  if (feeId) {
    // Carrega a linha INTEIRA para servir de snapshot de restauracao.
    const { data: existente } = await supabase
      .from("fee")
      .select("*")
      .eq("id", feeId)
      .maybeSingle();
    if (!existente || (existente as { tenant_id?: string }).tenant_id !== tenantId) {
      throw new TaxaAdminErro("taxa_nao_encontrada");
    }
    if ((existente as { source_submission_id?: string | null }).source_submission_id != null) {
      throw new TaxaAdminErro("taxa_gerida");
    }
    // Snapshot dos vinculos antes de qualquer escrita destrutiva.
    const snapProdutos = await snapshotVinculos(supabase, feeId);

    const { data: upd, error } = await supabase
      .from("fee")
      .update({ ...linha, updated_at: new Date().toISOString() })
      .eq("id", feeId)
      .eq("tenant_id", tenantId)
      .is("source_submission_id", null)
      .select("id");
    if (error) {
      console.error("[taxas] atualizar fee:", error.message);
      throw new TaxaAdminErro("falha_persistir");
    }
    if (!upd || upd.length === 0) throw new TaxaAdminErro("taxa_nao_encontrada");
    id = feeId;
    criado = false;

    try {
      await persistirVinculos(supabase, id, product_ids);
    } catch (e) {
      // Restaura COLUNAS + vinculos (as colunas do fee ja foram atualizadas —
      // reverter so os vinculos deixaria campus novo com produtos antigos).
      await restaurarTaxa(supabase, existente as Record<string, unknown>, snapProdutos);
      throw e;
    }
  } else {
    const { data, error } = await supabase
      .from("fee")
      .insert({ ...linha, source_submission_id: null })
      .select("id")
      .single();
    if (error || !data) {
      if (error) console.error("[taxas] criar fee:", error.message);
      throw new TaxaAdminErro("falha_persistir");
    }
    id = (data as { id: string }).id;
    criado = true;

    try {
      await persistirVinculos(supabase, id, product_ids);
    } catch (e) {
      const { error: eComp } = await supabase.from("fee").delete().eq("id", id).eq("tenant_id", tenantId);
      if (eComp) console.error("[taxas] compensacao (apagar fee orfa) falhou:", eComp.message);
      throw e;
    }
  }

  await registrarAuditoriaAdmin(supabase, {
    usuario: actor,
    acao: criado ? "taxa.criar" : "taxa.editar",
    alvo: id,
    detalhe: { name: fee.name, fee_type: fee.fee_type, modo: fee.amount != null ? "fixo" : "tabela", produtos: product_ids.length, kinds: fee.applies_to_kinds.length },
    ip: ip ?? null,
  });

  return { id, criado };
}

async function snapshotVinculos(supabase: SupabaseClient, feeId: string): Promise<string[]> {
  const { data } = await supabase.from("fee_product").select("product_id").eq("fee_id", feeId);
  return (data ?? []).map((v: any) => v.product_id);
}

// Substitui o conjunto de vinculos fee_product (delete + insert).
async function persistirVinculos(supabase: SupabaseClient, feeId: string, productIds: string[]): Promise<void> {
  const { error: eDel } = await supabase.from("fee_product").delete().eq("fee_id", feeId);
  if (eDel) {
    console.error("[taxas] limpar vínculos:", eDel.message);
    throw new TaxaAdminErro("falha_persistir");
  }
  if (productIds.length > 0) {
    const { error: eIns } = await supabase.from("fee_product").insert(productIds.map((pid) => ({ fee_id: feeId, product_id: pid })));
    if (eIns) {
      console.error("[taxas] inserir vínculos:", eIns.message);
      throw new TaxaAdminErro("falha_persistir");
    }
  }
}

// Restaura (best-effort) as COLUNAS do fee + os vinculos a partir do snapshot.
// NUNCA lanca — o erro original da mutacao e que deve propagar; aqui so tentamos
// nao deixar o estado corrompido (ex.: campus novo com produtos do campus antigo).
async function restaurarTaxa(
  supabase: SupabaseClient,
  linhaAnterior: Record<string, unknown>,
  snapshotProdutos: string[],
): Promise<void> {
  const id = linhaAnterior.id as string;
  try {
    await supabase
      .from("fee")
      .update({
        campus_id: linhaAnterior.campus_id,
        name: linhaAnterior.name,
        fee_type: linhaAnterior.fee_type,
        charge_basis: linhaAnterior.charge_basis,
        amount: linhaAnterior.amount,
        currency: linhaAnterior.currency,
        price_template_id: linhaAnterior.price_template_id,
        is_refundable: linhaAnterior.is_refundable,
        is_mandatory: linhaAnterior.is_mandatory,
        applies_to_kinds: linhaAnterior.applies_to_kinds,
        valid_from: linhaAnterior.valid_from,
        valid_until: linhaAnterior.valid_until,
        updated_at: linhaAnterior.updated_at ?? null,
      })
      .eq("id", id);
    await supabase.from("fee_product").delete().eq("fee_id", id);
    if (snapshotProdutos.length > 0) {
      await supabase.from("fee_product").insert(snapshotProdutos.map((pid) => ({ fee_id: id, product_id: pid })));
    }
  } catch (err) {
    console.error("[taxas] restauracao apos falha parcial falhou:", err instanceof Error ? err.message : err);
  }
}

// Arquiva (soft-delete) uma taxa manual do tenant. Recusa taxa gerida.
export async function arquivarTaxa(
  supabase: SupabaseClient,
  args: { tenantId: string; actor: string; ip?: string | null; feeId: string },
): Promise<void> {
  const { tenantId, actor, ip, feeId } = args;
  const { data: existente } = await supabase
    .from("fee")
    .select("id, tenant_id, source_submission_id")
    .eq("id", feeId)
    .maybeSingle();
  if (!existente || (existente as { tenant_id?: string }).tenant_id !== tenantId) {
    throw new TaxaAdminErro("taxa_nao_encontrada");
  }
  if ((existente as { source_submission_id?: string | null }).source_submission_id != null) {
    throw new TaxaAdminErro("taxa_gerida");
  }
  const { data: upd, error } = await supabase
    .from("fee")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", feeId)
    .eq("tenant_id", tenantId)
    .is("source_submission_id", null)
    .select("id");
  if (error) {
    console.error("[taxas] arquivar fee:", error.message);
    throw new TaxaAdminErro("falha_persistir");
  }
  if (!upd || upd.length === 0) throw new TaxaAdminErro("taxa_nao_encontrada");
  await registrarAuditoriaAdmin(supabase, { usuario: actor, acao: "taxa.arquivar", alvo: feeId, ip: ip ?? null });
}

// ── Leituras para a UI admin ────────────────────────────────────────────────

export type TaxaLista = {
  id: string;
  name: string;
  feeType: string;
  chargeBasis: string;
  modo: "fixo" | "tabela";
  amount: number | null;
  currency: string | null;
  isMandatory: boolean;
  campusId: string;
  campusName: string | null;
  appliesToKinds: string[];
  produtos: number;
  gerida: boolean;
  updatedAt: string | null;
};

export async function listarTaxasAdmin(
  supabase: SupabaseClient,
  tenantId: string,
  filtro?: { campusId?: string },
): Promise<TaxaLista[]> {
  let q = supabase
    .from("fee")
    .select(
      "id, name, fee_type, charge_basis, amount, currency, is_mandatory, campus_id, applies_to_kinds, price_template_id, source_submission_id, updated_at, campus:campus(name), vinculos:fee_product(count)",
    )
    .eq("tenant_id", tenantId)
    .is("archived_at", null)
    .order("updated_at", { ascending: false, nullsFirst: false })
    .order("name");
  if (filtro?.campusId) q = q.eq("campus_id", filtro.campusId);
  const { data } = await q;
  return (data ?? []).map((f: any) => {
    const campus = Array.isArray(f.campus) ? f.campus[0] : f.campus;
    const produtos = Array.isArray(f.vinculos) ? (f.vinculos[0]?.count ?? 0) : 0;
    return {
      id: f.id,
      name: f.name,
      feeType: f.fee_type,
      chargeBasis: f.charge_basis,
      modo: f.amount != null ? "fixo" : "tabela",
      amount: f.amount != null ? Number(f.amount) : null,
      currency: f.currency ?? null,
      isMandatory: !!f.is_mandatory,
      campusId: f.campus_id,
      campusName: campus?.name ?? null,
      appliesToKinds: Array.isArray(f.applies_to_kinds) ? f.applies_to_kinds : [],
      produtos,
      gerida: f.source_submission_id != null,
      updatedAt: f.updated_at ?? null,
    };
  });
}

export async function obterTaxaAdmin(
  supabase: SupabaseClient,
  tenantId: string,
  feeId: string,
): Promise<{ fee: Record<string, unknown>; product_ids: string[]; gerida: boolean } | null> {
  const { data: fee } = await supabase.from("fee").select("*").eq("id", feeId).eq("tenant_id", tenantId).maybeSingle();
  if (!fee) return null;
  const { data: vinc } = await supabase.from("fee_product").select("product_id").eq("fee_id", feeId);
  return {
    fee: fee as Record<string, unknown>,
    product_ids: (vinc ?? []).map((v: any) => v.product_id),
    gerida: (fee as { source_submission_id?: string | null }).source_submission_id != null,
  };
}

// Tabelas de preco de um campus (para o seletor do modo "derivado de tabela").
export async function listarTemplatesDoCampus(
  supabase: SupabaseClient,
  tenantId: string,
  campusId: string,
): Promise<{ id: string; name: string; currency: string }[]> {
  const { data } = await supabase
    .from("price_template")
    .select("id, name, currency")
    .eq("tenant_id", tenantId)
    .eq("campus_id", campusId)
    .is("archived_at", null)
    .order("name");
  return (data ?? []).map((t: any) => ({ id: t.id, name: t.name, currency: t.currency }));
}
