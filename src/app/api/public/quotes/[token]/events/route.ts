import { recordQuoteEvent } from "@/lib/quote-issue-service";
import {
  guardPortal,
  portalErro,
  portalOk,
  portalErroDeExcecao,
  sanitizarMetadata,
} from "@/lib/portal-route";

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
  const metadata = sanitizarMetadata(b.metadata);

  try {
    const res = await recordQuoteEvent(g.supabase, token, kind, metadata);
    if (!res.ok) return portalErro("Nao encontrado.", "nao_encontrado", 404);
    return portalOk(res);
  } catch (err) {
    return portalErroDeExcecao(err);
  }
}
