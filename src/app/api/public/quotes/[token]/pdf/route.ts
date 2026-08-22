import { getPublicQuote, recordQuoteEvent } from "@/lib/quote-issue-service";
import { renderQuotePdf } from "@/lib/quote-pdf";
import { guardPortal, portalErro } from "@/lib/portal-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/public/quotes/[token]/pdf — PDF da cotacao gerado no SERVIDOR (marca).
// Publico (o token e a posse; guardPortal aplica formato + rate-limit + noindex).
// Query opcional: ?option=<indice> para baixar apenas uma opcao.
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

    // Filtro opcional por opcao (indice publico).
    const url = new URL(request.url);
    const optRaw = url.searchParams.get("option");
    let optionIndex: number | undefined;
    if (optRaw != null) {
      const n = Number(optRaw);
      if (!Number.isInteger(n) || !data.options.some((o) => o.index === n)) {
        return portalErro("Opcao inexistente.", "invalido", 400);
      }
      optionIndex = n;
    }

    // Registra o download (best-effort; nao derruba o PDF se a telemetria falhar).
    try {
      await recordQuoteEvent(g.supabase, token, "downloaded", {
        ...(optionIndex != null ? { optionIndex } : {}),
      });
    } catch {
      /* telemetria e best-effort */
    }

    const pdf = await renderQuotePdf(data, optionIndex);
    const nome = `cotacao-${data.reference}${optionIndex != null ? `-opcao-${optionIndex + 1}` : ""}.pdf`;

    return new Response(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${nome}"`,
        "Content-Length": String(pdf.length),
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  } catch {
    return portalErro("Nao foi possivel gerar o PDF.", "erro_interno", 500);
  }
}
