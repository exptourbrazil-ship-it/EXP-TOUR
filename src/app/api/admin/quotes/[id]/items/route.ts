import { tenantIdAtual } from "@/lib/catalog-service";
import { addQuoteItem, removeQuoteItem } from "@/lib/quote-service";
import {
  getSupabase,
  guardCatalog,
  bad,
  fail,
  okData,
  hojeSaoPauloISO,
  isIsoDate,
  optionBelongsToQuote,
} from "@/lib/catalog-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/quotes/[id]/items — precifica e adiciona um item a uma opcao.
// Body: optionId, productId, startDate, quantity, unit, quoteDate?, nationalityCode?
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

  const optionId = typeof b.optionId === "string" ? b.optionId : "";
  const productId = typeof b.productId === "string" ? b.productId : "";
  const startDate = b.startDate;
  const quantity = Number(b.quantity);
  const unit = typeof b.unit === "string" ? b.unit : "";
  const quoteDate = b.quoteDate ?? hojeSaoPauloISO();
  const nationalityCode =
    typeof b.nationalityCode === "string" ? b.nationalityCode : undefined;

  if (!optionId) return bad("Informe optionId.");
  if (!productId) return bad("Informe productId.");
  if (!isIsoDate(startDate)) return bad("startDate invalido (AAAA-MM-DD).");
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return bad("quantity deve ser um numero > 0.");
  }
  if (!unit) return bad("Informe unit.");
  if (!isIsoDate(quoteDate)) return bad("quoteDate invalido (AAAA-MM-DD).");

  try {
    const supabase = getSupabase();
    const tenantId = await tenantIdAtual(supabase);
    // Posse: a opcao precisa pertencer a esta cotacao.
    if (!(await optionBelongsToQuote(supabase, tenantId, optionId, quoteId))) {
      return bad("Opcao nao pertence a esta cotacao.", "nao_encontrado", 404);
    }
    const result = await addQuoteItem(
      supabase,
      { tenantId, optionId, productId, startDate, quantity, unit, quoteDate, nationalityCode },
      { usuario: g.usuario, ip: g.ip },
    );
    return okData(result);
  } catch (err) {
    return fail(err);
  }
}

// DELETE /api/admin/quotes/[id]/items — remove um item de uma opcao (so em
// rascunho). Body: { itemId }. Posse e status validados no servico.
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await guardCatalog(request);
  if (!g.ok) return g.response;

  const { id: quoteId } = await params;
  if (!quoteId) return bad("Informe o id da cotacao.");

  const b = await request.json().catch(() => null);
  const itemId = b && typeof b.itemId === "string" ? b.itemId : "";
  if (!itemId) return bad("Informe itemId.");

  try {
    const supabase = getSupabase();
    const tenantId = await tenantIdAtual(supabase);
    const result = await removeQuoteItem(
      supabase,
      { tenantId, quoteId, itemId },
      { usuario: g.usuario, ip: g.ip },
    );
    return okData(result);
  } catch (err) {
    return fail(err);
  }
}
