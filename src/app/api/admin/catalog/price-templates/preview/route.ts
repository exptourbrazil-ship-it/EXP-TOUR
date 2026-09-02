import { tenantIdAtual, priceProductFromDb } from "@/lib/catalog-service";
import { getSupabase, guardCatalogWrite, bad, fail, okData, hojeSaoPauloISO, isIsoDate } from "@/lib/catalog-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/catalog/price-templates/preview — pré-visualiza o preço de um
// produto (motor puro + banco) para quem EDITA catálogo (guardCatalogWrite,
// fornecedores.gerir). Espelha /api/admin/catalog/price, mas com a capacidade de
// escrita de catálogo (a rota de cotação exige propostas.gerir). Read-only.
export async function POST(request: Request) {
  const g = await guardCatalogWrite(request);
  if (!g.ok) return g.response;

  const b = await request.json().catch(() => null);
  if (!b || typeof b !== "object") return bad("Corpo JSON invalido.");

  const productId = typeof b.productId === "string" ? b.productId : "";
  const startDate = b.startDate;
  const quantity = Number(b.quantity);
  const unit = typeof b.unit === "string" ? b.unit : "";
  const quoteDate = b.quoteDate ?? hojeSaoPauloISO();
  const nationalityCode = typeof b.nationalityCode === "string" ? b.nationalityCode : undefined;

  if (!productId) return bad("Informe productId.");
  if (!isIsoDate(startDate)) return bad("startDate invalido (AAAA-MM-DD).");
  if (!Number.isFinite(quantity) || quantity <= 0) return bad("quantity deve ser um numero > 0.");
  if (!unit) return bad("Informe unit.");
  if (!isIsoDate(quoteDate)) return bad("quoteDate invalido (AAAA-MM-DD).");

  try {
    const supabase = getSupabase();
    const tenantId = await tenantIdAtual(supabase);
    const priced = await priceProductFromDb(supabase, { tenantId, productId, startDate, quantity, unit, quoteDate, nationalityCode });
    return okData(priced);
  } catch (err) {
    return fail(err);
  }
}
