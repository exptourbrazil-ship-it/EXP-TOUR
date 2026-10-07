import { tenantIdAtual } from "@/lib/catalog-service";
import { restaurarTaxa } from "@/lib/arquivados-service";
import { getSupabase, guardCatalogWrite, bad, okData, isUuid } from "@/lib/catalog-route";
import { respostaErroRestaurar } from "../../../resposta-erro";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/fornecedores/[id]/arquivados/taxas/[feeId]/restaurar —
// restaura uma taxa arquivada DESTE fornecedor (guardas: campus vivo, taxa
// manual, tabela de origem viva). Só sessão com 'fornecedores.gerir'.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; feeId: string }> },
) {
  const g = await guardCatalogWrite(request);
  if (!g.ok) return g.response;
  const { id, feeId } = await params;
  if (!isUuid(id) || !isUuid(feeId)) return bad("Id inválido.");
  try {
    const supabase = getSupabase();
    const tenantId = await tenantIdAtual(supabase);
    await restaurarTaxa(supabase, { tenantId, actor: g.usuario, ip: g.ip, supplierId: id, feeId });
    return okData({ restaurado: true });
  } catch (err) {
    return respostaErroRestaurar(err);
  }
}
