// Servico de ESCRITA de produtos do catalogo pela Area Administrativa (Admin com
// escrita em TODOS os verticais: programa, acomodacao, seguro, transfer/outros,
// pacote). SERVER-ONLY (service role) — as rotas criam o cliente com
// SUPABASE_SERVICE_ROLE_KEY e o passam como argumento.
//
// POSSE: toda operacao e escopada pelo tenant vigente. O produto pendura num
// campus (product.campus_id NOT NULL); antes de criar/editar, conferimos que o
// campus pertence ao tenant (nenhum produto nasce sob campus de outro tenant) e,
// no update, que o proprio produto e do tenant. A validacao/normalizacao dos
// campos vem do motor PURO src/lib/produto.ts; aqui so persistimos e auditamos.
import type { SupabaseClient } from "@supabase/supabase-js";
import { validarProduto, type Detalhe, type Falha } from "@/lib/produto";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";

// Erro de dominio com codigo estavel (a rota mapeia para HTTP + mensagem).
export class ProdutoAdminErro extends Error {
  constructor(
    public codigo:
      | "validacao"
      | "campus_invalido"
      | "produto_nao_encontrado"
      | "kind_imutavel"
      | "item_invalido"
      | "falha_persistir",
    public falhas?: Falha[],
  ) {
    super(codigo);
    this.name = "ProdutoAdminErro";
  }
}

// Mapa kind -> tabela de detalhe (1:1 com o schema).
const TABELA_DETALHE: Record<Detalhe["kind"], string> = {
  program: "program_detail",
  accommodation: "accommodation_detail",
  insurance: "insurance_detail",
  other: "other_product_detail",
  package: "package",
};

// Confere que um campus pertence ao tenant vigente. Retorna true/false.
async function campusDoTenant(supabase: SupabaseClient, tenantId: string, campusId: string): Promise<boolean> {
  const { data } = await supabase
    .from("campus")
    .select("id, tenant_id")
    .eq("id", campusId)
    .maybeSingle();
  return !!data && (data as { tenant_id?: string }).tenant_id === tenantId;
}

// Confere que TODOS os ids sao produtos do tenant vigente (posse). Usado para os
// itens de um pacote: um item so pode compor um pacote se for do mesmo tenant —
// sem isso, um pacote poderia referenciar/expor produto de outro tenant.
async function todosProdutosDoTenant(
  supabase: SupabaseClient,
  tenantId: string,
  ids: string[],
): Promise<boolean> {
  const unicos = [...new Set(ids)];
  if (unicos.length === 0) return true;
  const { data } = await supabase
    .from("product")
    .select("id")
    .eq("tenant_id", tenantId)
    .in("id", unicos);
  return (data?.length ?? 0) === unicos.length;
}

// Extrai o objeto de colunas da tabela de detalhe a partir do detalhe normalizado.
function colunasDetalhe(det: Detalhe): Record<string, unknown> {
  switch (det.kind) {
    case "program":
      return { ...det.program };
    case "accommodation":
      return { ...det.accommodation };
    case "insurance":
      return { ...det.insurance };
    case "other":
      return { ...det.other };
    case "package":
      // itens vao para package_item; o detalhe do proprio pacote sao as 3 colunas.
      return { valid_from: det.package.valid_from, valid_until: det.package.valid_until, pricing_mode: det.package.pricing_mode };
  }
}

// Persiste o detalhe do vertical (upsert por product_id) e, para pacote,
// substitui o conjunto de itens (delete + insert). Loga o erro real do banco
// server-side (nunca ao cliente) e lanca falha_persistir. A posse dos itens ja
// foi validada pelo chamador antes de qualquer escrita.
async function persistirDetalheEItens(supabase: SupabaseClient, id: string, detalhe: Detalhe): Promise<void> {
  const tabela = TABELA_DETALHE[detalhe.kind];
  const { error: eDet } = await supabase
    .from(tabela)
    .upsert({ product_id: id, ...colunasDetalhe(detalhe) }, { onConflict: "product_id" });
  if (eDet) {
    console.error("[produtos] detalhe:", eDet.message);
    throw new ProdutoAdminErro("falha_persistir");
  }

  if (detalhe.kind === "package") {
    const { error: eDel } = await supabase.from("package_item").delete().eq("package_product_id", id);
    if (eDel) {
      console.error("[produtos] limpar itens:", eDel.message);
      throw new ProdutoAdminErro("falha_persistir");
    }
    if (detalhe.package.itens.length > 0) {
      const linhas = detalhe.package.itens.map((it) => ({
        package_product_id: id,
        item_product_id: it.item_product_id,
        quantity: it.quantity,
        unit: it.unit,
        is_optional: it.is_optional,
        sort: it.sort,
      }));
      const { error: eItens } = await supabase.from("package_item").insert(linhas);
      if (eItens) {
        console.error("[produtos] itens:", eItens.message);
        throw new ProdutoAdminErro("falha_persistir");
      }
    }
  }
}

export type SalvarProdutoArgs = {
  tenantId: string;
  actor: string; // usuario admin (auditoria)
  ip?: string | null;
  productId?: string | null; // ausente = criar; presente = editar
  entrada: unknown; // corpo cru (validado pelo motor)
};

// Cria ou edita um produto (core + detalhe do vertical + itens de pacote) e grava
// a trilha. Devolve o id do produto.
export async function salvarProdutoAdmin(
  supabase: SupabaseClient,
  args: SalvarProdutoArgs,
): Promise<{ id: string; criado: boolean }> {
  const { tenantId, actor, ip, productId } = args;

  const r = validarProduto(args.entrada);
  if (!r.ok) throw new ProdutoAdminErro("validacao", r.falhas);
  const { core, detalhe, campus_id } = r.valor;

  // Posse de tenant no campus alvo.
  if (!(await campusDoTenant(supabase, tenantId, campus_id))) {
    throw new ProdutoAdminErro("campus_invalido");
  }

  // Itens de pacote: valida POSSE e auto-referencia ANTES de qualquer escrita
  // (falha barata; nao cria produto para depois compensar). Auto-referencia so e
  // possivel na edicao (na criacao o id ainda nao existe).
  if (detalhe.kind === "package") {
    const idsItens = detalhe.package.itens.map((it) => it.item_product_id);
    if (productId && idsItens.some((x) => x === productId)) {
      throw new ProdutoAdminErro("item_invalido");
    }
    if (!(await todosProdutosDoTenant(supabase, tenantId, idsItens))) {
      throw new ProdutoAdminErro("item_invalido");
    }
  }

  let id: string;
  let criado: boolean;

  if (productId) {
    // Edicao: o produto tem que ser do tenant; o kind e imutavel (o detalhe mora
    // numa tabela por kind — trocar orfanaria/duplicaria detalhe).
    const { data: existente } = await supabase
      .from("product")
      .select("id, tenant_id, kind")
      .eq("id", productId)
      .maybeSingle();
    if (!existente || (existente as { tenant_id?: string }).tenant_id !== tenantId) {
      throw new ProdutoAdminErro("produto_nao_encontrado");
    }
    if ((existente as { kind?: string }).kind !== core.kind) {
      throw new ProdutoAdminErro("kind_imutavel");
    }

    const { error } = await supabase
      .from("product")
      .update({
        campus_id,
        name: core.name,
        internal_code: core.internal_code,
        source: core.source,
        visibility: core.visibility,
        status: core.status,
        default_unit: core.default_unit,
        min_duration: core.min_duration,
        max_duration: core.max_duration,
        available_from: core.available_from,
        available_until: core.available_until,
        attributes: core.attributes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", productId)
      .eq("tenant_id", tenantId); // guarda extra de posse
    if (error) {
      console.error("[produtos] atualizar product:", error.message);
      throw new ProdutoAdminErro("falha_persistir");
    }
    id = productId;
    criado = false;
  } else {
    const { data, error } = await supabase
      .from("product")
      .insert({
        tenant_id: tenantId,
        campus_id,
        kind: core.kind,
        name: core.name,
        internal_code: core.internal_code,
        source: core.source,
        visibility: core.visibility,
        status: core.status,
        default_unit: core.default_unit,
        min_duration: core.min_duration,
        max_duration: core.max_duration,
        available_from: core.available_from,
        available_until: core.available_until,
        attributes: core.attributes,
        created_by_user_id: null, // actor e e-mail/usuario, nao uuid; a trilha registra quem
      })
      .select("id")
      .single();
    if (error || !data) {
      if (error) console.error("[produtos] criar product:", error.message);
      throw new ProdutoAdminErro("falha_persistir");
    }
    id = (data as { id: string }).id;
    criado = true;
  }

  // Detalhe do vertical + itens de pacote. Sem transacao no PostgREST: numa
  // CRIACAO, se qualquer passo falhar, COMPENSAMOS apagando o produto recem-criado
  // (nao deixa produto orfao sem detalhe). Numa edicao nao compensamos.
  try {
    await persistirDetalheEItens(supabase, id, detalhe);
  } catch (e) {
    if (criado) {
      await supabase.from("product").delete().eq("id", id).eq("tenant_id", tenantId);
    }
    throw e;
  }

  await registrarAuditoriaAdmin(supabase, {
    usuario: actor,
    acao: criado ? "produto.criar" : "produto.editar",
    alvo: id,
    detalhe: { kind: core.kind, name: core.name, status: core.status, visibility: core.visibility },
    ip: ip ?? null,
  });

  return { id, criado };
}

// Arquiva (soft-delete) um produto do tenant. Confere posse. Idempotente.
export async function arquivarProdutoAdmin(
  supabase: SupabaseClient,
  args: { tenantId: string; actor: string; ip?: string | null; productId: string },
): Promise<void> {
  const { tenantId, actor, ip, productId } = args;
  const { data: existente } = await supabase
    .from("product")
    .select("id, tenant_id")
    .eq("id", productId)
    .maybeSingle();
  if (!existente || (existente as { tenant_id?: string }).tenant_id !== tenantId) {
    throw new ProdutoAdminErro("produto_nao_encontrado");
  }
  const { error } = await supabase
    .from("product")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", productId)
    .eq("tenant_id", tenantId);
  if (error) {
    console.error("[produtos] arquivar:", error.message);
    throw new ProdutoAdminErro("falha_persistir");
  }

  await registrarAuditoriaAdmin(supabase, {
    usuario: actor,
    acao: "produto.arquivar",
    alvo: productId,
    ip: ip ?? null,
  });
}

// ── Leituras para a UI admin ────────────────────────────────────────────────

export type ProdutoLista = {
  id: string;
  kind: string;
  name: string;
  status: string;
  visibility: string;
  source: string;
  campusId: string;
  campusName: string | null;
  supplierName: string | null;
  updatedAt: string | null;
};

// Lista os produtos do tenant (todos os verticais, exceto arquivados), com nome
// do campus/fornecedor. Filtro opcional por kind.
export async function listarProdutosAdmin(
  supabase: SupabaseClient,
  tenantId: string,
  filtro?: { kind?: string },
): Promise<ProdutoLista[]> {
  let q = supabase
    .from("product")
    .select("id, kind, name, status, visibility, source, campus_id, updated_at, campus:campus(name, supplier:supplier(display_name))")
    .eq("tenant_id", tenantId)
    .is("archived_at", null)
    .order("updated_at", { ascending: false, nullsFirst: false })
    .order("name");
  if (filtro?.kind) q = q.eq("kind", filtro.kind);
  const { data } = await q;
  return (data ?? []).map((p: any) => {
    const campus = Array.isArray(p.campus) ? p.campus[0] : p.campus;
    const supplier = campus && (Array.isArray(campus.supplier) ? campus.supplier[0] : campus.supplier);
    return {
      id: p.id,
      kind: p.kind,
      name: p.name,
      status: p.status,
      visibility: p.visibility,
      source: p.source ?? "internal",
      campusId: p.campus_id,
      campusName: campus?.name ?? null,
      supplierName: supplier?.display_name ?? null,
      updatedAt: p.updated_at ?? null,
    };
  });
}

// Carrega um produto do tenant COM o detalhe do seu vertical (para o editor).
// Retorna null se nao for do tenant.
export async function obterProdutoAdmin(
  supabase: SupabaseClient,
  tenantId: string,
  productId: string,
): Promise<{ core: Record<string, unknown>; detalhe: Record<string, unknown> | null; itens?: unknown[] } | null> {
  const { data: prod } = await supabase
    .from("product")
    .select("*")
    .eq("id", productId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!prod) return null;
  const kind = (prod as { kind: Detalhe["kind"] }).kind;

  const { data: det } = await supabase
    .from(TABELA_DETALHE[kind])
    .select("*")
    .eq("product_id", productId)
    .maybeSingle();

  let itens: unknown[] | undefined;
  if (kind === "package") {
    const { data: pi } = await supabase
      .from("package_item")
      .select("item_product_id, quantity, unit, is_optional, sort")
      .eq("package_product_id", productId)
      .order("sort");
    itens = pi ?? [];
  }

  return { core: prod as Record<string, unknown>, detalhe: (det as Record<string, unknown>) ?? null, itens };
}

// Campi do tenant (para o seletor do editor): id, nome, supplier_id e fornecedor.
export async function listarCampusDoTenant(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<{ id: string; name: string; supplierId: string | null; supplierName: string | null }[]> {
  const { data } = await supabase
    .from("campus")
    .select("id, name, supplier_id, supplier:supplier(display_name)")
    .eq("tenant_id", tenantId)
    .is("archived_at", null)
    .order("name");
  return (data ?? []).map((c: any) => {
    const supplier = Array.isArray(c.supplier) ? c.supplier[0] : c.supplier;
    return { id: c.id, name: c.name, supplierId: c.supplier_id ?? null, supplierName: supplier?.display_name ?? null };
  });
}

// Contagem de produtos por vertical (para o hub de Inventário). Leve: seleciona
// só a coluna kind do tenant (não arquivados) e agrega em memória.
export type ContagemInventario = {
  program: number;
  accommodation: number;
  insurance: number;
  other: number;
  package: number;
  total: number;
};

export async function contarInventario(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<ContagemInventario> {
  const base: ContagemInventario = { program: 0, accommodation: 0, insurance: 0, other: 0, package: 0, total: 0 };
  const { data } = await supabase
    .from("product")
    .select("kind")
    .eq("tenant_id", tenantId)
    .is("archived_at", null);
  for (const r of (data ?? []) as { kind?: string }[]) {
    const k = r.kind as keyof ContagemInventario | undefined;
    if (k && k in base && k !== "total") {
      base[k] += 1;
      base.total += 1;
    }
  }
  return base;
}

// Vínculos de preço/taxa de UM produto (para a página unificada "Editar produto"
// estilo Edvisor). Lista as tabelas de preço e as taxas ligadas a este produto
// pelas tabelas de junção (price_template_product / fee_product), sempre escopado
// pelo tenant — o join !inner filtra pelo product_id e o .eq(tenant_id) garante
// posse (nenhuma tabela/taxa de outro tenant vaza). `gerida` marca linhas vindas
// de price list de escola (só leitura no editor dedicado).
export type PrecoVinculado = {
  id: string;
  name: string;
  status: string;
  currency: string;
  unit: string;
  validFrom: string;
  validUntil: string | null;
  gerida: boolean;
};
export type TaxaVinculada = {
  id: string;
  name: string;
  feeType: string;
  chargeBasis: string;
  amount: number | null;
  currency: string | null;
  isMandatory: boolean;
  gerida: boolean;
};

export async function listarVinculosDoProduto(
  supabase: SupabaseClient,
  tenantId: string,
  productId: string,
): Promise<{ precos: PrecoVinculado[]; taxas: TaxaVinculada[] }> {
  // Padrão de dois passos (o mesmo de catalog-service.ts): busca os ids na tabela
  // de junção por product_id e depois carrega as linhas na tabela pai filtrada por
  // tenant_id (posse). Evita a ambiguidade de filtrar recurso embutido por alias.
  const [ptpRes, fpRes] = await Promise.all([
    supabase.from("price_template_product").select("price_template_id").eq("product_id", productId),
    supabase.from("fee_product").select("fee_id").eq("product_id", productId),
  ]);
  if (ptpRes.error) throw new Error(`Falha ao carregar vínculos de preço: ${ptpRes.error.message}`);
  if (fpRes.error) throw new Error(`Falha ao carregar vínculos de taxa: ${fpRes.error.message}`);

  const templateIds = (ptpRes.data ?? []).map((r: any) => r.price_template_id);
  const feeIds = (fpRes.data ?? []).map((r: any) => r.fee_id);

  const [precosRes, taxasRes] = await Promise.all([
    templateIds.length === 0
      ? Promise.resolve({ data: [], error: null } as { data: any[]; error: null })
      : supabase
          .from("price_template")
          .select("id, name, status, currency, unit, valid_from, valid_until, source_submission_id")
          .eq("tenant_id", tenantId)
          .in("id", templateIds)
          .is("archived_at", null)
          .order("valid_from", { ascending: false }),
    feeIds.length === 0
      ? Promise.resolve({ data: [], error: null } as { data: any[]; error: null })
      : supabase
          .from("fee")
          .select("id, name, fee_type, charge_basis, amount, currency, is_mandatory, source_submission_id")
          .eq("tenant_id", tenantId)
          .in("id", feeIds)
          .is("archived_at", null)
          .order("name"),
  ]);
  if (precosRes.error) throw new Error(`Falha ao carregar tabelas de preço: ${precosRes.error.message}`);
  if (taxasRes.error) throw new Error(`Falha ao carregar taxas: ${taxasRes.error.message}`);

  const precos: PrecoVinculado[] = (precosRes.data ?? []).map((t: any) => ({
    id: t.id,
    name: t.name,
    status: t.status,
    currency: t.currency,
    unit: t.unit,
    validFrom: t.valid_from,
    validUntil: t.valid_until ?? null,
    gerida: t.source_submission_id != null,
  }));
  const taxas: TaxaVinculada[] = (taxasRes.data ?? []).map((f: any) => ({
    id: f.id,
    name: f.name,
    feeType: f.fee_type,
    chargeBasis: f.charge_basis,
    amount: f.amount != null ? Number(f.amount) : null,
    currency: f.currency ?? null,
    isMandatory: !!f.is_mandatory,
    gerida: f.source_submission_id != null,
  }));
  return { precos, taxas };
}
