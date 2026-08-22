import { getPublicQuote } from "@/lib/quote-issue-service";
import { guardPortal, portalErro, portalOk } from "@/lib/portal-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/public/quotes/[token] — fotografia publica (sanitizada) da cotacao.
// Sem auth: o token e a posse. 404 generico quando nao visivel (sem enumeracao).
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const g = await guardPortal(request, token);
  if (!g.ok) return g.response;

  try {
    const data = await getPublicQuote(g.supabase, token);
    if (!data) return portalErro("Nao encontrado.", "nao_encontrado", 404);
    return portalOk(data);
  } catch {
    return portalErro("Erro ao carregar a cotacao.", "erro_interno", 500);
  }
}
