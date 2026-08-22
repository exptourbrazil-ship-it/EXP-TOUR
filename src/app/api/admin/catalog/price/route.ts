import { tenantIdAtual, priceProductFromDb } from "@/lib/catalog-service";
import type { StudentContext } from "@/lib/catalog";
import {
  getSupabase,
  guardCatalog,
  bad,
  fail,
  okData,
  hojeSaoPauloISO,
  isIsoDate,
} from "@/lib/catalog-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/catalog/price — precifica um produto (motor puro + banco).
// Body: productId, startDate, quantity, unit, quoteDate?, nationalityCode?, studentContext?
export async function POST(request: Request) {
  const g = await guardCatalog(request);
  if (!g.ok) return g.response;

  const b = await request.json().catch(() => null);
  if (!b || typeof b !== "object") return bad("Corpo JSON invalido.");

  const productId = typeof b.productId === "string" ? b.productId : "";
  const startDate = b.startDate;
  const quantity = Number(b.quantity);
  const unit = typeof b.unit === "string" ? b.unit : "";
  const quoteDate = b.quoteDate ?? hojeSaoPauloISO();
  const nationalityCode =
    typeof b.nationalityCode === "string" ? b.nationalityCode : undefined;
  const studentContext =
    b.studentContext && typeof b.studentContext === "object"
      ? (b.studentContext as StudentContext)
      : undefined;

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
    const priced = await priceProductFromDb(supabase, {
      tenantId,
      productId,
      startDate,
      quantity,
      unit,
      quoteDate,
      nationalityCode,
      studentContext,
    });
    return okData(priced);
  } catch (err) {
    return fail(err);
  }
}
