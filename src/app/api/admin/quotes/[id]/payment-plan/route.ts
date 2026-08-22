import { tenantIdAtual } from "@/lib/catalog-service";
import { setPaymentPlan, type PaymentInstallmentInput } from "@/lib/quote-service";
import {
  getSupabase,
  guardCatalog,
  bad,
  fail,
  okData,
  isIsoDate,
  optionBelongsToQuote,
} from "@/lib/catalog-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const METHODS = ["pix", "boleto", "card", "bank_transfer", "mixed"] as const;

// POST /api/admin/quotes/[id]/payment-plan — define o plano de pagamento da opcao.
// Body: optionId, installments: [{ dueDate, amount, currency, description? }], method?
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
  if (!optionId) return bad("Informe optionId.");

  if (!Array.isArray(b.installments) || b.installments.length === 0) {
    return bad("Informe ao menos uma parcela em installments.");
  }
  const installments: PaymentInstallmentInput[] = [];
  for (const [i, raw] of (b.installments as unknown[]).entries()) {
    const it = raw as Record<string, unknown>;
    if (!isIsoDate(it?.dueDate)) {
      return bad(`Parcela ${i + 1}: dueDate invalido (AAAA-MM-DD).`);
    }
    const amount = Number(it?.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return bad(`Parcela ${i + 1}: amount deve ser > 0.`);
    }
    const currency = typeof it?.currency === "string" ? it.currency : "";
    if (!currency) return bad(`Parcela ${i + 1}: informe currency.`);
    installments.push({
      dueDate: it.dueDate as string,
      amount,
      currency,
      description: typeof it?.description === "string" ? it.description : undefined,
    });
  }

  const method =
    typeof b.method === "string" && (METHODS as readonly string[]).includes(b.method)
      ? (b.method as (typeof METHODS)[number])
      : undefined;
  if (b.method !== undefined && method === undefined) {
    return bad("method invalido.");
  }

  try {
    const supabase = getSupabase();
    const tenantId = await tenantIdAtual(supabase);
    if (!(await optionBelongsToQuote(supabase, tenantId, optionId, quoteId))) {
      return bad("Opcao nao pertence a esta cotacao.", "nao_encontrado", 404);
    }
    const result = await setPaymentPlan(
      supabase,
      { tenantId, optionId, installments, method },
      { usuario: g.usuario, ip: g.ip },
    );
    return okData(result);
  } catch (err) {
    return fail(err);
  }
}
