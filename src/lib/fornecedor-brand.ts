// Marca (tenant) do Portal do Parceiro. SERVER-ONLY. Resolve a identidade visual
// pelo TENANT do próprio supplier (supplier.tenant_id -> tenant.slug), do mesmo
// jeito que a Área do Cliente resolve a marca por cotação. Assim o portal obedece
// ao tenant (EXP Tour / Forio) sem duplicar componentes.
import type { SupabaseClient } from "@supabase/supabase-js";
import { getTenantBrand, type TenantBrand } from "@/lib/tenant-brand";

export async function brandDoFornecedor(supabase: SupabaseClient, supplierId: string): Promise<TenantBrand> {
  const { data: sup } = await supabase.from("supplier").select("tenant_id").eq("id", supplierId).maybeSingle();
  const tenantId = (sup as { tenant_id?: string } | null)?.tenant_id;
  let slug: string | null = null;
  if (tenantId) {
    const { data: t } = await supabase.from("tenant").select("slug").eq("id", tenantId).maybeSingle();
    slug = (t as { slug?: string } | null)?.slug ?? null;
  }
  // Sem tenant resolvido -> marca da instância (CATALOGO_TENANT_SLUG) -> default seguro.
  return getTenantBrand(slug ?? process.env.CATALOGO_TENANT_SLUG ?? null);
}
