import { tenantIdAtual } from "@/lib/catalog-service";
import { restaurarProduto } from "@/lib/arquivados-service";
import { getSupabase, guardCatalogWrite, bad, okData, isUuid } from "@/lib/catalog-route";
import { respostaErroRestaurar } from "../../../resposta-erro";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/fornecedores/[id]/arquivados/produtos/[productId]/restaurar —
// restaura (limpa archived_at) um produto arquivado DESTE fornecedor. Não muda
// status/visibility. Só sessão com 'fornecedores.gerir' (sem atalho Bearer).
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; productId: string }> },
) {
  const g = await guardCatalogWrite(request);
  if (!g.ok) return g.response;
  const { id, productId } = await params;
  if (!isUuid(id) || !isUuid(productId)) return bad("Id inválido.");
  try {
    const supabase = getSupabase();
    const tenantId = await tenantIdAtual(supabase);
    await restaurarProduto(supabase, { tenantId, actor: g.usuario, ip: g.ip, supplierId: id, productId });
    return okData({ restaurado: true });
  } catch (err) {
    return respostaErroRestaurar(err);
  }
}
