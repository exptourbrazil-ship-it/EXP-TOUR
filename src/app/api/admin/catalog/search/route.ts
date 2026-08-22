import { tenantIdAtual, searchProducts } from "@/lib/catalog-service";
import { getSupabase, guardCatalog, bad, fail, okData } from "@/lib/catalog-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/catalog/search — busca contextual no catalogo interno.
// Querystring: campusIds[] (repetido), kinds[] (repetido), keyword, limit, offset.
export async function GET(request: Request) {
  const g = await guardCatalog(request);
  if (!g.ok) return g.response;

  try {
    const supabase = getSupabase();
    const tenantId = await tenantIdAtual(supabase);
    const url = new URL(request.url);

    const campusIds = url.searchParams.getAll("campusIds");
    const kinds = url.searchParams.getAll("kinds");
    const keyword = url.searchParams.get("keyword") ?? undefined;

    const limitRaw = url.searchParams.get("limit");
    const offsetRaw = url.searchParams.get("offset");
    const limit = limitRaw != null ? Number(limitRaw) : undefined;
    const offset = offsetRaw != null ? Number(offsetRaw) : undefined;
    if (limit !== undefined && (!Number.isFinite(limit) || limit < 0)) {
      return bad("Parametro 'limit' invalido.");
    }
    if (offset !== undefined && (!Number.isFinite(offset) || offset < 0)) {
      return bad("Parametro 'offset' invalido.");
    }

    const data = await searchProducts(supabase, {
      tenantId,
      campusIds: campusIds.length > 0 ? campusIds : undefined,
      kinds: kinds.length > 0 ? kinds : undefined,
      keyword,
      limit,
      offset,
    });
    return okData(data);
  } catch (err) {
    return fail(err);
  }
}
