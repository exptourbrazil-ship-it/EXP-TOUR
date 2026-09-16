// Leituras do HUB DO FORNECEDOR (Área Admin) — a visão centrada em CADA
// fornecedor (F1). SERVER-ONLY (service role): as páginas criam o cliente com
// SUPABASE_SERVICE_ROLE_KEY e o passam aqui. Toda leitura é escopada pelo
// tenant vigente E pelo supplier_id (posse dupla), reusando os serviços de
// listagem existentes onde possível.
import type { SupabaseClient } from "@supabase/supabase-js";
import { listarProdutosAdmin, type ProdutoLista } from "@/lib/produto-admin-service";

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
