// Leituras do HUB DO FORNECEDOR (Área Admin) — a visão centrada em CADA
// fornecedor (F1). SERVER-ONLY (service role): as páginas criam o cliente com
// SUPABASE_SERVICE_ROLE_KEY e o passam aqui. Toda leitura é escopada pelo
// tenant vigente E pelo supplier_id (posse dupla), reusando os serviços de
// listagem existentes onde possível.
import type { SupabaseClient } from "@supabase/supabase-js";
import { listarProdutosAdmin, type ProdutoLista } from "@/lib/produto-admin-service";
import { listarPromocoesAdmin, type PromocaoLista } from "@/lib/promocao-admin-service";

export type FornecedorHub = {
  id: string;
  displayName: string;
  legalName: string | null;
  country: string | null;
  website: string | null;
  status: string;
  preferido: boolean;
  prazoPagamentoDias: number | null;
};

// Carrega o fornecedor SE ele pertencer ao tenant vigente. Retorna null caso
// contrário (a página faz notFound) — nenhum fornecedor de outro tenant abre.
export async function carregarFornecedorDoTenant(
  supabase: SupabaseClient,
  tenantId: string,
  supplierId: string,
): Promise<FornecedorHub | null> {
  const { data } = await supabase
    .from("supplier")
    .select("id, tenant_id, display_name, legal_name, country_code, website, relationship_status, is_preferred, prazo_pagamento_dias")
    .eq("id", supplierId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!data || (data as { tenant_id?: string }).tenant_id !== tenantId) return null;
  const s = data as {
    id: string;
    display_name: string;
    legal_name: string | null;
    country_code: string | null;
    website: string | null;
    relationship_status: string;
    is_preferred: boolean;
    prazo_pagamento_dias: number | null;
  };
  return {
    id: s.id,
    displayName: s.display_name,
    legalName: s.legal_name ?? null,
    country: s.country_code ?? null,
    website: s.website ?? null,
    status: s.relationship_status,
    preferido: !!s.is_preferred,
    prazoPagamentoDias: s.prazo_pagamento_dias ?? null,
  };
}

// Ids dos campi (unidades) do fornecedor no tenant. Base para escopar produtos,
// preços e taxas (cadeia product/price_template/fee → campus → supplier).
export async function campusIdsDoFornecedor(
  supabase: SupabaseClient,
  tenantId: string,
  supplierId: string,
): Promise<string[]> {
  const { data } = await supabase
    .from("campus")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("supplier_id", supplierId)
    .is("archived_at", null);
  return (data ?? []).map((c: { id: string }) => c.id);
}

// Produtos do fornecedor (via campus). Reusa a listagem do tenant e filtra pelos
// campi do fornecedor — o catálogo é pequeno; mantém uma só fonte de verdade do
// shape/mapeamento (ProdutoLista) em produto-admin-service.
export async function listarProdutosDoFornecedor(
  supabase: SupabaseClient,
  tenantId: string,
  supplierId: string,
  filtro?: { kind?: string },
): Promise<ProdutoLista[]> {
  const campusIds = new Set(await campusIdsDoFornecedor(supabase, tenantId, supplierId));
  if (campusIds.size === 0) return [];
  const todos = await listarProdutosAdmin(supabase, tenantId, filtro);
  return todos.filter((p) => campusIds.has(p.campusId));
}

export type ResumoInventarioFornecedor = {
  campus: number;
  produtos: number;
  materiais: number;
  promocoes: number;
};

// Contadores do "Visão geral" do hub. Todos escopados por tenant + supplier.
export async function resumoInventarioFornecedor(
  supabase: SupabaseClient,
  tenantId: string,
  supplierId: string,
): Promise<ResumoInventarioFornecedor> {
  const campusIds = await campusIdsDoFornecedor(supabase, tenantId, supplierId);

  const contarProdutos =
    campusIds.length === 0
      ? Promise.resolve({ count: 0 } as { count: number | null })
      : supabase
          .from("product")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .in("campus_id", campusIds)
          .is("archived_at", null);

  const [prod, mat, promo] = await Promise.all([
    contarProdutos,
    supabase
      .from("material")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("supplier_id", supplierId)
      .is("archived_at", null),
    supabase
      .from("promotion")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("supplier_id", supplierId)
      .is("archived_at", null),
  ]);

  return {
    campus: campusIds.length,
    produtos: prod.count ?? 0,
    materiais: mat.count ?? 0,
    promocoes: promo.count ?? 0,
  };
}

// ── F1b: leituras escopadas por fornecedor para as abas restantes ───────────

export type ContagemPorTipo = {
  program: number;
  accommodation: number;
  insurance: number;
  other: number;
  package: number;
};

// Contagem de produtos por tipo (para o "Inventário" no estilo Edvisor: Programs,
// Accommodations, Insurance, Other Products, Packages). Escopo tenant + supplier.
export async function contarProdutosPorTipoDoFornecedor(
  supabase: SupabaseClient,
  tenantId: string,
  supplierId: string,
): Promise<ContagemPorTipo> {
  const zero: ContagemPorTipo = { program: 0, accommodation: 0, insurance: 0, other: 0, package: 0 };
  const campusIds = await campusIdsDoFornecedor(supabase, tenantId, supplierId);
  if (campusIds.length === 0) return zero;
  const { data } = await supabase
    .from("product")
    .select("kind")
    .eq("tenant_id", tenantId)
    .in("campus_id", campusIds)
    .is("archived_at", null);
  const acc = { ...zero };
  for (const r of (data ?? []) as { kind: string }[]) {
    if (Object.hasOwn(acc, r.kind)) (acc as Record<string, number>)[r.kind] += 1;
  }
  return acc;
}

export type CampusHub = {
  id: string;
  nome: string;
  cidade: string | null;
  pais: string | null;
  status: string;
};

// Escolas/Campus do fornecedor (unidades). Escopado por tenant + supplier.
export async function listarCampusDoFornecedor(
  supabase: SupabaseClient,
  tenantId: string,
  supplierId: string,
): Promise<CampusHub[]> {
  const { data } = await supabase
    .from("campus")
    .select("id, name, city, country_code, status")
    .eq("tenant_id", tenantId)
    .eq("supplier_id", supplierId)
    .is("archived_at", null)
    .order("name");
  return (data ?? []).map((c: any) => ({
    id: c.id,
    nome: c.name,
    cidade: c.city ?? null,
    pais: c.country_code ?? null,
    status: c.status,
  }));
}

// Promoções do fornecedor (promotion.supplier_id direto).
export async function listarPromocoesDoFornecedor(
  supabase: SupabaseClient,
  tenantId: string,
  supplierId: string,
): Promise<PromocaoLista[]> {
  return listarPromocoesAdmin(supabase, tenantId, { supplierId });
}
