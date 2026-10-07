import { tenantIdAtual } from "@/lib/catalog-service";
import { arquivarInativosDoFornecedor } from "@/lib/produto-arquivamento-service";
import { getSupabase, guardCatalogWrite, bad, okData, isUuid } from "@/lib/catalog-route";
import { respostaErroProduto } from "@/app/api/admin/produtos/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const KINDS = ["program", "accommodation", "insurance", "other", "package"];

// POST /api/admin/fornecedores/[id]/produtos/arquivar-inativos — arquiva (soft-
// delete) os produtos INATIVOS do fornecedor, opcionalmente de um tipo.
// Body: { kind?: "program"|... }. Capacidade 'fornecedores.gerir' por SESSÃO
// (guardCatalogWrite; sem atalho Bearer). Tenant + fornecedor conferidos no
// serviço; limite de segurança de itens por chamada.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardCatalogWrite(request);
  if (!g.ok) return g.response;
  if (g.usuario === "bearer-secret") {
    return bad("Operação em lote exige sessão de administrador.", "nao_autorizado", 401);
  }

  const { id } = await params;
  if (!isUuid(id)) return bad("Id de fornecedor inválido.");

  const body = await request.json().catch(() => ({}));
  const kindBruto = (body as { kind?: unknown })?.kind;
  if (kindBruto != null && (typeof kindBruto !== "string" || !KINDS.includes(kindBruto))) {
    return bad("Tipo de produto inválido.");
  }

  try {
    const supabase = getSupabase();
    const tenantId = await tenantIdAtual(supabase);
    const r = await arquivarInativosDoFornecedor(supabase, {
      tenantId,
      actor: g.usuario,
      ip: g.ip,
      supplierId: id,
      kind: (kindBruto as string | null | undefined) ?? null,
    });
    return okData(r);
  } catch (err) {
    return respostaErroProduto(err);
  }
}
