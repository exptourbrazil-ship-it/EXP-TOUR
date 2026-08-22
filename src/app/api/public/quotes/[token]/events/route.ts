import { recordQuoteEvent } from "@/lib/quote-issue-service";
import { guardPortal, portalErro, portalOk } from "@/lib/portal-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/public/quotes/[token]/events — registra comportamento do estudante.
// Body: { kind: 'opened'|'option_viewed'|'downloaded', metadata? }.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const g = await guardPortal(request, token);
  if (!g.ok) return g.response;

  const b = (await request.json().catch(() => ({}))) ?? {};
  const kind = typeof b.kind === "string" ? b.kind : "";
  const metadata =
    b.metadata && typeof b.metadata === "object" ? (b.metadata as Record<string, unknown>) : undefined;

  try {
    const res = await recordQuoteEvent(g.supabase, token, kind, metadata);
    if (!res.ok) return portalErro("Nao encontrado.", "nao_encontrado", 404);
    return portalOk(res);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro.";
    return portalErro(msg, "invalido", 400);
  }
}
