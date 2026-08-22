import { tenantIdAtual } from "@/lib/catalog-service";
import { issueQuote, EmissaoBloqueada } from "@/lib/quote-issue-service";
import { getSupabase, guardCatalog, bad, fail, okData } from "@/lib/catalog-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/quotes/[id]/issue — emite a cotacao (congela cambio + snapshot,
// gera o token publico). Idempotente por quoteId. Body: validadeDias? (int).
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await guardCatalog(request);
  if (!g.ok) return g.response;

  const { id: quoteId } = await params;
  if (!quoteId) return bad("Informe o id da cotacao.");

  const b = (await request.json().catch(() => ({}))) ?? {};
  const validadeDias =
    typeof b.validadeDias === "number" && Number.isFinite(b.validadeDias)
      ? Math.floor(b.validadeDias)
      : undefined;

  try {
    const supabase = getSupabase();
    const tenantId = await tenantIdAtual(supabase);
    const result = await issueQuote(
      supabase,
      { tenantId, quoteId, validadeDias },
      { usuario: g.usuario, ip: g.ip },
    );
    return okData(result);
  } catch (err) {
    // Pre-condicoes nao atendidas: 422 com os motivos (nao e erro interno).
    if (err instanceof EmissaoBloqueada) {
      return bad(err.message, "emissao_bloqueada", 422);
    }
    return fail(err);
  }
}
