// Serviço SERVER-ONLY (service role) da aba "Arquivados" do hub do fornecedor:
// leitura (produtos, tabelas de preço e taxas arquivados) e restauração de
// produto/taxa. Tudo escopado por tenant E pelo fornecedor da URL (via campus).
// `price_template_product` e `package_item` não têm tenant_id: o escopo vem das
// tabelas pai (template/produto filtrados por tenant + campus do fornecedor).
//
// Tabela de preço é SOMENTE CONSULTA: uma tabela expirada reativada brigaria com
// a vigente do mesmo campus; para reaproveitar, cria-se uma tabela nova.
import type { SupabaseClient } from "@supabase/supabase-js";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";
import {
  LIMITE_POR_BLOCO,
  emLotes,
  limitarBloco,
  nomesPorTabela,
  recusaRestaurarProduto,
  recusaRestaurarTaxa,
} from "@/lib/arquivados";

export class RestaurarErro extends Error {
  constructor(
    public codigo: "nao_encontrado" | "recusado" | "falha_persistir",
    public mensagem?: string,
  ) {
    super(codigo);
    this.name = "RestaurarErro";
  }
}

export type FiltroArquivados = { q: string | null; kind: string | null; tipoTaxa: string | null };

export type ProdutoArquivado = {
  id: string;
  name: string;
  kind: string;
  status: string;
  campusId: string;
  campusName: string | null;
  campusArquivado: boolean;
  gerido: boolean;
  archivedAt: string;
};
export type TabelaArquivada = {
  id: string;
  name: string;
  status: string;
  currency: string;
  validFrom: string;
  validUntil: string | null;
  campusName: string | null;
  gerida: boolean;
  produtos: string[];
  archivedAt: string;
};
export type TaxaArquivada = {
  id: string;
  name: string;
  feeType: string;
  amount: number | null;
  currency: string | null;
  derivadaDeTabela: boolean;
  campusId: string;
  campusName: string | null;
  campusArquivado: boolean;
  gerida: boolean;
  archivedAt: string;
};
export type Bloco<T> = { itens: T[]; total: number; haMais: boolean };

type CampusRow = { id: string; name: string | null; archived_at: string | null };

// TODOS os campi do fornecedor no tenant (inclusive arquivados: produto/taxa
// arquivados podem pertencer a campus arquivado, e a tela precisa saber).
async function campiDoFornecedor(supabase: SupabaseClient, tenantId: string, supplierId: string): Promise<CampusRow[]> {
  const { data, error } = await supabase
    .from("campus")
    .select("id, name, archived_at")
    .eq("tenant_id", tenantId)
    .eq("supplier_id", supplierId);
  if (error) throw new Error("Falha ao carregar os campi do fornecedor.");
  return (data ?? []) as CampusRow[];
}

export async function listarArquivadosDoFornecedor(
  supabase: SupabaseClient,
  tenantId: string,
  supplierId: string,
  filtro: FiltroArquivados,
): Promise<{ produtos: Bloco<ProdutoArquivado>; tabelas: Bloco<TabelaArquivada>; taxas: Bloco<TaxaArquivada> }> {
  const campi = await campiDoFornecedor(supabase, tenantId, supplierId);
  const vazio = <T,>(): Bloco<T> => ({ itens: [], total: 0, haMais: false });
  if (campi.length === 0) return { produtos: vazio(), tabelas: vazio(), taxas: vazio() };
  const campusIds = campi.map((c) => c.id);
  const campusPorId = new Map(campi.map((c) => [c.id, c]));
  const { q, kind, tipoTaxa } = filtro;

  // ── Produtos ──
  let qp = supabase
    .from("product")
    .select("id, name, kind, status, campus_id, archived_at, source_submission_id", { count: "exact" })
    .eq("tenant_id", tenantId)
    .in("campus_id", campusIds)
    .not("archived_at", "is", null)
    .order("archived_at", { ascending: false })
    .limit(LIMITE_POR_BLOCO);
  if (kind) qp = qp.eq("kind", kind);
  if (q) qp = qp.ilike("name", `%${q}%`);

  // ── Tabelas de preço ──
  let qt = supabase
    .from("price_template")
    .select("id, name, status, currency, valid_from, valid_until, campus_id, archived_at, source_submission_id", { count: "exact" })
    .eq("tenant_id", tenantId)
    .in("campus_id", campusIds)
    .not("archived_at", "is", null)
    .order("archived_at", { ascending: false })
    .limit(LIMITE_POR_BLOCO);
  if (q) qt = qt.ilike("name", `%${q}%`);

  // ── Taxas ──
  let qf = supabase
    .from("fee")
    .select("id, name, fee_type, amount, currency, price_template_id, campus_id, archived_at, source_submission_id", { count: "exact" })
    .eq("tenant_id", tenantId)
    .in("campus_id", campusIds)
    .not("archived_at", "is", null)
    .order("archived_at", { ascending: false })
    .limit(LIMITE_POR_BLOCO);
  if (tipoTaxa) qf = qf.eq("fee_type", tipoTaxa);
  if (q) qf = qf.ilike("name", `%${q}%`);

  const [rp, rt, rf] = await Promise.all([qp, qt, qf]);
  if (rp.error || rt.error || rf.error) {
    console.error("[arquivados] listar:", rp.error?.message ?? rt.error?.message ?? rf.error?.message);
    throw new Error("Falha ao carregar os arquivados.");
  }

  const produtos: ProdutoArquivado[] = ((rp.data ?? []) as any[]).map((p) => {
    const c = campusPorId.get(p.campus_id);
    return {
      id: p.id,
      name: p.name,
      kind: p.kind,
      status: p.status,
      campusId: p.campus_id,
      campusName: c?.name ?? null,
      campusArquivado: !!c?.archived_at,
      gerido: p.source_submission_id != null,
      archivedAt: p.archived_at,
    };
  });

  // Produtos ligados às tabelas: vínculos em lotes; nomes só de produtos DO
  // TENANT (price_template_product não tem tenant_id).
  const templates = (rt.data ?? []) as any[];
  const templateIds = templates.map((t) => t.id as string);
  const vinculos: Array<{ price_template_id: string; product_id: string }> = [];
  for (const lote of emLotes(templateIds)) {
    const { data, error } = await supabase
      .from("price_template_product")
      .select("price_template_id, product_id")
      .in("price_template_id", lote);
    if (error) throw new Error("Falha ao carregar os produtos das tabelas.");
    vinculos.push(...((data ?? []) as any[]));
  }
  const produtoIds = [...new Set(vinculos.map((v) => v.product_id))];
  const nomeDoProduto = new Map<string, string>();
  for (const lote of emLotes(produtoIds)) {
    const { data, error } = await supabase.from("product").select("id, name").eq("tenant_id", tenantId).in("id", lote);
    if (error) throw new Error("Falha ao carregar os produtos das tabelas.");
    for (const p of (data ?? []) as any[]) nomeDoProduto.set(p.id, p.name);
  }
  const ligados = nomesPorTabela(vinculos, nomeDoProduto);
  const tabelas: TabelaArquivada[] = templates.map((t) => ({
    id: t.id,
    name: t.name,
    status: t.status,
    currency: t.currency,
    validFrom: t.valid_from,
    validUntil: t.valid_until ?? null,
    campusName: campusPorId.get(t.campus_id)?.name ?? null,
    gerida: t.source_submission_id != null,
    produtos: ligados.get(t.id) ?? [],
    archivedAt: t.archived_at,
  }));

  const taxas: TaxaArquivada[] = ((rf.data ?? []) as any[]).map((f) => {
    const c = campusPorId.get(f.campus_id);
    return {
      id: f.id,
      name: f.name,
      feeType: f.fee_type,
      amount: f.amount != null ? Number(f.amount) : null,
      currency: f.currency ?? null,
      derivadaDeTabela: f.price_template_id != null,
      campusId: f.campus_id,
      campusName: c?.name ?? null,
      campusArquivado: !!c?.archived_at,
      gerida: f.source_submission_id != null,
      archivedAt: f.archived_at,
    };
  });

  return {
    produtos: limitarBloco(produtos, rp.count ?? produtos.length),
    tabelas: limitarBloco(tabelas, rt.count ?? tabelas.length),
    taxas: limitarBloco(taxas, rf.count ?? taxas.length),
  };
}

// ── Restaurar ────────────────────────────────────────────────────────────────

// Campus do registro, conferido por tenant E fornecedor da URL. Falha fechada.
async function campusDoFornecedor(
  supabase: SupabaseClient,
  tenantId: string,
  supplierId: string,
  campusId: string,
): Promise<{ archived_at: string | null }> {
  const { data } = await supabase
    .from("campus")
    .select("id, supplier_id, tenant_id, archived_at")
    .eq("id", campusId)
    .eq("tenant_id", tenantId)
    .eq("supplier_id", supplierId)
    .maybeSingle();
  if (!data) throw new RestaurarErro("nao_encontrado");
  return data as { archived_at: string | null };
}

// Restaura (limpa archived_at) um produto do fornecedor. NÃO muda status nem
// visibility. UPDATE condicional (archived_at is not null) contra corrida.
export async function restaurarProduto(
  supabase: SupabaseClient,
  args: { tenantId: string; actor: string; ip?: string | null; supplierId: string; productId: string },
): Promise<void> {
  const { tenantId, actor, ip, supplierId, productId } = args;
  const { data } = await supabase
    .from("product")
    .select("id, tenant_id, name, kind, status, visibility, campus_id, archived_at")
    .eq("id", productId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!data) throw new RestaurarErro("nao_encontrado");
  const p = data as any;
  const campus = await campusDoFornecedor(supabase, tenantId, supplierId, p.campus_id);

  const recusa = recusaRestaurarProduto({ arquivado: p.archived_at != null, campusArquivado: campus.archived_at != null });
  if (recusa) throw new RestaurarErro("recusado", recusa.mensagem);

  const { data: upd, error } = await supabase
    .from("product")
    .update({ archived_at: null })
    .eq("id", productId)
    .eq("tenant_id", tenantId)
    .not("archived_at", "is", null)
    .select("id");
  if (error) {
    console.error("[arquivados] restaurar produto:", error.message);
    throw new RestaurarErro("falha_persistir");
  }
  if (!upd || upd.length === 0) throw new RestaurarErro("recusado", "O produto já foi restaurado por outra ação.");

  await registrarAuditoriaAdmin(supabase, {
    usuario: actor,
    acao: "produto.restaurar",
    alvo: productId,
    detalhe: {
      nome: p.name,
      kind: p.kind,
      status: p.status,
      visibility: p.visibility ?? null,
      supplier_id: supplierId,
      arquivado_antes: true,
      arquivado_depois: false,
      archived_at_antes: p.archived_at,
    },
    ip: ip ?? null,
  });
}

// Restaura uma taxa do fornecedor, respeitando as guardas do fee-admin-service:
// campus vivo, taxa manual (não gerida por price list) e tabela de origem viva.
export async function restaurarTaxa(
  supabase: SupabaseClient,
  args: { tenantId: string; actor: string; ip?: string | null; supplierId: string; feeId: string },
): Promise<void> {
  const { tenantId, actor, ip, supplierId, feeId } = args;
  const { data } = await supabase
    .from("fee")
    .select("id, tenant_id, name, fee_type, amount, currency, campus_id, price_template_id, source_submission_id, archived_at")
    .eq("id", feeId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!data) throw new RestaurarErro("nao_encontrado");
  const f = data as any;
  const campus = await campusDoFornecedor(supabase, tenantId, supplierId, f.campus_id);

  let tabelaOrigemArquivada = false;
  if (f.price_template_id) {
    const { data: tpl } = await supabase
      .from("price_template")
      .select("id, archived_at, status")
      .eq("id", f.price_template_id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    // Tabela sumida/de outro tenant, arquivada OU não ativa (expirada que o
    // backfill ainda não arquivou) também bloqueia (falha fechada).
    const t = tpl as { archived_at: string | null; status: string } | null;
    tabelaOrigemArquivada = !t || t.archived_at != null || t.status !== "active";
  }

  const recusa = recusaRestaurarTaxa({
    arquivada: f.archived_at != null,
    campusArquivado: campus.archived_at != null,
    gerida: f.source_submission_id != null,
    tabelaOrigemArquivada,
  });
  if (recusa) throw new RestaurarErro("recusado", recusa.mensagem);

  const { data: upd, error } = await supabase
    .from("fee")
    .update({ archived_at: null })
    .eq("id", feeId)
    .eq("tenant_id", tenantId)
    .is("source_submission_id", null)
    .not("archived_at", "is", null)
    .select("id");
  if (error) {
    console.error("[arquivados] restaurar taxa:", error.message);
    throw new RestaurarErro("falha_persistir");
  }
  if (!upd || upd.length === 0) throw new RestaurarErro("recusado", "A taxa já foi restaurada por outra ação.");

  await registrarAuditoriaAdmin(supabase, {
    usuario: actor,
    acao: "taxa.restaurar",
    alvo: feeId,
    detalhe: {
      nome: f.name,
      fee_type: f.fee_type,
      amount: f.amount != null ? Number(f.amount) : null,
      currency: f.currency ?? null,
      supplier_id: supplierId,
      arquivado_antes: true,
      arquivado_depois: false,
      archived_at_antes: f.archived_at,
    },
    ip: ip ?? null,
  });
}
