import { tenantIdAtual } from "@/lib/catalog-service";
import { impactoArquivarTabela } from "@/lib/produto-arquivamento-service";
import { getSupabase, guardCatalogWrite, bad, okData, isUuid, hojeSaoPauloISO } from "@/lib/catalog-route";
import { respostaErroPreco } from "../../route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/catalog/price-templates/[id]/impacto-arquivar — produtos ATIVOS
// que ficariam sem tabela vigente se esta for arquivada (informativo).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardCatalogWrite(request);
  if (!g.ok) return g.response;
  const { id } = await params;
  if (!isUuid(id)) return bad("Id de tabela inválido.");
  try {
    const supabase = getSupabase();
    const tenantId = await tenantIdAtual(supabase);
    const r = await impactoArquivarTabela(supabase, tenantId, id, hojeSaoPauloISO());
    if (!r) return bad("Tabela de preço não encontrada.", "nao_encontrado", 404);
    return okData(r);
  } catch (err) {
    return respostaErroPreco(err);
  }
}
