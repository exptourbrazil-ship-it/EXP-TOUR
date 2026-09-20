import { tenantIdAtual } from "@/lib/catalog-service";
import { carregarIndiceCatalogo } from "@/lib/catalog-indice";
import { getSupabase, guardCatalog, fail, okData } from "@/lib/catalog-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/catalog/browse — indice do catalogo cotavel do tenant para o
// buscador do construtor de cotacao. Sem querystring: a filtragem (termo, pais,
// tipo, duracao) e feita no cliente sobre este indice, como no /orcamento.
// O preco NAO vem aqui — vem do motor real em /api/admin/catalog/price-batch.
export async function GET(request: Request) {
  const g = await guardCatalog(request);
  if (!g.ok) return g.response;

  try {
    const supabase = getSupabase();
    const tenantId = await tenantIdAtual(supabase);
    const indice = await carregarIndiceCatalogo(supabase, tenantId);
    return okData(indice);
  } catch (err) {
    return fail(err);
  }
}
