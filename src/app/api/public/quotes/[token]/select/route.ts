import { selectQuoteOption } from "@/lib/quote-issue-service";
import { guardPortal, portalErro, portalOk } from "@/lib/portal-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/public/quotes/[token]/select — o estudante escolhe uma opcao.
// Body: { optionIndex: int, confirmar: true }. Escolha em 2 etapas (a UI so
// envia confirmar=true no segundo passo) e irreversivel pelo portal.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const g = await guardPortal(request, token);
  if (!g.ok) return g.response;

  const b = (await request.json().catch(() => ({}))) ?? {};
  const optionIndex = Number(b.optionIndex);
  const confirmar = b.confirmar === true;
  if (!Number.isInteger(optionIndex) || optionIndex < 0) {
    return portalErro("optionIndex invalido.", "invalido", 400);
  }

  try {
    const res = await selectQuoteOption(g.supabase, token, optionIndex, confirmar);
    return portalOk(res);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro.";
    return portalErro(msg, "invalido", 400);
  }
}
