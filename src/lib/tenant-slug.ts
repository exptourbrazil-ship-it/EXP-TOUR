// Resolve o slug do tenant a partir do id (server-only). Usado para tematizar
// e-mails pela marca do titular (titulares.tenant_id -> slug -> EmailTheme).
// A tabela tenant e estatica, entao cacheamos por processo para nao consultar a
// cada e-mail (importa no cron, que envia em lote).
import type { SupabaseClient } from "@supabase/supabase-js";

const cache = new Map<string, string>();

export async function slugDoTenant(
  supabase: SupabaseClient,
  tenantId: string | null | undefined,
): Promise<string | null> {
  if (!tenantId) return null;
  const hit = cache.get(tenantId);
  if (hit) return hit;
  const { data } = await supabase
    .from("tenant")
    .select("slug")
    .eq("id", tenantId)
    .maybeSingle();
  const slug = (data?.slug as string) ?? null;
  if (slug) cache.set(tenantId, slug);
  return slug;
}
