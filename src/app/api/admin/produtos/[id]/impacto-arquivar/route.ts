import { tenantIdAtual } from "@/lib/catalog-service";
import { impactoArquivarProduto } from "@/lib/produto-arquivamento-service";
import { getSupabase, guardCatalogWrite, bad, okData, isUuid } from "@/lib/catalog-route";
import { respostaErroProduto } from "../../route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/produtos/[id]/impacto-arquivar — o que acontece se arquivar
// (pacotes que bloqueiam; cotações em rascunho afetadas). Só leitura.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardCatalogWrite(request);
  if (!g.ok) return g.response;
  const { id } = await params;
  if (!isUuid(id)) return bad("Id de produto inválido.");
  try {
    const supabase = getSupabase();
    const tenantId = await tenantIdAtual(supabase);
    const r = await impactoArquivarProduto(supabase, tenantId, id);
    if (!r) return bad("Produto não encontrado.", "nao_encontrado", 404);
    return okData(r);
  } catch (err) {
    return respostaErroProduto(err);
  }
}
