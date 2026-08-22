import { tenantIdAtual } from "@/lib/catalog-service";
import { addQuoteOption } from "@/lib/quote-service";
import { getSupabase, guardCatalog, bad, fail, okData } from "@/lib/catalog-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/quotes/[id]/options — adiciona uma opcao (quoteId = param).
// Body: label?, copyFromOptionId?
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await guardCatalog(request);
  if (!g.ok) return g.response;

  const { id: quoteId } = await params;
  if (!quoteId) return bad("Informe o id da cotacao.");

  const b = (await request.json().catch(() => ({}))) ?? {};
  const label = typeof b.label === "string" ? b.label : undefined;
  const copyFromOptionId =
    typeof b.copyFromOptionId === "string" ? b.copyFromOptionId : undefined;

  try {
    const supabase = getSupabase();
    const tenantId = await tenantIdAtual(supabase);
    const result = await addQuoteOption(
      supabase,
      { tenantId, quoteId, label, copyFromOptionId },
      { usuario: g.usuario, ip: g.ip },
    );
    return okData(result);
  } catch (err) {
    return fail(err);
  }
}
