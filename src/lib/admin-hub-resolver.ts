import type { SupabaseClient } from "@supabase/supabase-js";
import { resolverFornecedorDoRegistro } from "./admin-hub-nav";

// Resolução (com banco) do FORNECEDOR dono de um registro do catálogo, para as
// telas devolverem o admin ao hub certo. Tudo escopado por tenant e FALHA
// FECHADA: devolve null se o registro/campus/fornecedor não for do tenant — a
// tela então cai em /admin/fornecedores. Nunca confia em supplier vindo cru da
// querystring: o fornecedor sempre é derivado do próprio registro.
//
// A lógica de decisão (ambiguidade, mapa campus -> fornecedor) fica em
// admin-hub-nav.ts (pura e testada); aqui só há leituras.

async function campiDoTenant(
  supabase: SupabaseClient,
  tenantId: string,
  ids: string[],
): Promise<Array<{ id: string; supplierId: string | null }>> {
  const unicos = [...new Set(ids.filter(Boolean))];
  if (unicos.length === 0) return [];
  // Inclui campus arquivado de propósito: o registro ainda pertence ao fornecedor.
  const { data } = await supabase.from("campus").select("id, supplier_id").eq("tenant_id", tenantId).in("id", unicos);
  const campi = (data ?? []) as Array<{ id: string; supplier_id: string | null }>;
  const supplierIds = [...new Set(campi.map((c) => c.supplier_id).filter((s): s is string => !!s))];
  if (supplierIds.length === 0) return [];
  // O fornecedor também tem que ser do tenant.
  const { data: sups } = await supabase.from("supplier").select("id").eq("tenant_id", tenantId).in("id", supplierIds);
  const validos = new Set(((sups ?? []) as Array<{ id: string }>).map((s) => s.id));
  return campi.map((c) => ({ id: c.id, supplierId: c.supplier_id && validos.has(c.supplier_id) ? c.supplier_id : null }));
}

// Fornecedor de um conjunto de campi candidatos.
export async function fornecedorDosCampi(
  supabase: SupabaseClient,
  tenantId: string,
  campusIds: Array<string | null | undefined>,
): Promise<string | null> {
  const ids = campusIds.filter((x): x is string => !!x);
  const campi = await campiDoTenant(supabase, tenantId, ids);
  return resolverFornecedorDoRegistro(ids, campi);
}

// Produto -> { fornecedor, kind } (via campus). null se o produto não for do tenant.
export async function contextoDoProduto(
  supabase: SupabaseClient,
  tenantId: string,
  productId: string,
): Promise<{ supplierId: string | null; kind: string; campusId: string } | null> {
  const { data } = await supabase
    .from("product")
    .select("kind, campus_id")
    .eq("id", productId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!data) return null;
  const p = data as { kind: string; campus_id: string };
  const supplierId = await fornecedorDosCampi(supabase, tenantId, [p.campus_id]);
  return { supplierId, kind: p.kind, campusId: p.campus_id };
}

// Produtos do tenant -> campus (para tabelas/taxas vinculadas a produtos).
async function campiDosProdutos(
  supabase: SupabaseClient,
  tenantId: string,
  productIds: string[],
): Promise<string[]> {
  if (productIds.length === 0) return [];
  const { data } = await supabase.from("product").select("campus_id").eq("tenant_id", tenantId).in("id", productIds);
  return ((data ?? []) as Array<{ campus_id: string }>).map((p) => p.campus_id);
}

// Tabela de preço / taxa: campus próprio + campi dos produtos vinculados.
export async function fornecedorDeTabelaOuTaxa(
  supabase: SupabaseClient,
  tenantId: string,
  campusId: string | null | undefined,
  productIds: string[],
): Promise<string | null> {
  const doProdutos = await campiDosProdutos(supabase, tenantId, productIds);
  return fornecedorDosCampi(supabase, tenantId, [campusId, ...doProdutos]);
}

// Promoção -> fornecedor. promotion.supplier_id é NOT NULL; ainda assim confere
// tenant do fornecedor (e, se houver campus fixo, que ele seja do mesmo).
export async function fornecedorDaPromocao(
  supabase: SupabaseClient,
  tenantId: string,
  promotion: Record<string, unknown>,
): Promise<string | null> {
  const supplierId = (promotion.supplier_id as string | null | undefined) ?? null;
  if (!supplierId) return null;
  const { data } = await supabase.from("supplier").select("id").eq("id", supplierId).eq("tenant_id", tenantId).maybeSingle();
  return data ? supplierId : null;
}

// Produto candidato a "contexto de volta" (?produto=): só vale se o produto
// pertencer ao MESMO fornecedor do registro que está sendo editado.
export async function produtoDoFornecedor(
  supabase: SupabaseClient,
  tenantId: string,
  productId: string | null | undefined,
  supplierId: string | null,
): Promise<string | null> {
  if (!productId || !supplierId) return null;
  const ctx = await contextoDoProduto(supabase, tenantId, productId);
  return ctx && ctx.supplierId === supplierId ? productId : null;
}
