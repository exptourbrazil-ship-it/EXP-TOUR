import { tenantIdAtual } from "@/lib/catalog-service";
import { setQuoteNotes } from "@/lib/quote-service";
import { getSupabase, guardCatalog, bad, fail, okData } from "@/lib/catalog-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/quotes/[id]/notes — grava as observacoes do consultor da
// cotacao (aba "Notes" do portal). Body: { notesHtml }. String vazia limpa.
// Escrita comercial protegida por guardCatalog (capacidade do modulo).
const MAX_NOTES = 20000;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await guardCatalog(request);
  if (!g.ok) return g.response;

  const { id: quoteId } = await params;
  if (!quoteId) return bad("Informe o id da cotacao.");

  const b = await request.json().catch(() => null);
  if (!b || typeof b !== "object") return bad("Corpo JSON invalido.");
  if (typeof b.notesHtml !== "string") return bad("Informe notesHtml (string).");
  if (b.notesHtml.length > MAX_NOTES) return bad(`Observações muito longas (máx. ${MAX_NOTES} caracteres).`);

  try {
    const supabase = getSupabase();
    const tenantId = await tenantIdAtual(supabase);
    const result = await setQuoteNotes(
      supabase,
      { tenantId, quoteId, notesHtml: b.notesHtml },
      { usuario: g.usuario, ip: g.ip },
    );
    return okData(result);
  } catch (err) {
    return fail(err);
  }
}
