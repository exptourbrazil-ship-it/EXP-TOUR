import { tenantIdAtual } from "@/lib/catalog-service";
import { addManualDiscount, DescontoAcimaDoTeto } from "@/lib/quote-service";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";
import {
  getSupabase,
  guardCatalog,
  bad,
  fail,
  okData,
  optionBelongsToQuote,
} from "@/lib/catalog-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPES = ["percent", "fixed", "free_units"] as const;

// POST /api/admin/quotes/[id]/discounts — grava um desconto MANUAL na opcao/item.
// Body: optionId, itemId?, type, value, appliesTo, reason
//
// TETO: TETO_DESCONTO_MANUAL_PERCENT (default 15). Se type='percent' e
// value > teto e o papel NAO for 'gestor' -> 403 acima_do_teto. Se um gestor
// passa do teto, e um OVERRIDE e fica registrado na auditoria (spec 6/14.2).
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
  const itemId = typeof b.itemId === "string" && b.itemId ? b.itemId : undefined;
  const type = typeof b.type === "string" ? b.type : "";
  const value = Number(b.value);
  const appliesTo = typeof b.appliesTo === "string" ? b.appliesTo : "";
  const reason = typeof b.reason === "string" ? b.reason.trim() : "";

  if (!optionId) return bad("Informe optionId.");
  if (!(TYPES as readonly string[]).includes(type)) {
    return bad("type invalido (percent|fixed|free_units).");
  }
  if (!Number.isFinite(value) || value <= 0) return bad("value deve ser > 0.");
  if (!appliesTo) return bad("Informe appliesTo.");
  if (!reason) return bad("Motivo (reason) e obrigatorio.");

  // Teto de desconto manual por papel. O teto e aplicado DENTRO do servico, que
  // conhece a base e converte qualquer tipo (percent|fixed) para % efetivo — asim
  // `fixed` nao burla o limite. Nao-gestor acima do teto -> DescontoAcimaDoTeto
  // (traduzido para 403); gestor ultrapassa como override (sinalizado no retorno).
  const teto = Number(process.env.TETO_DESCONTO_MANUAL_PERCENT ?? "15");
  const isGestor = g.papel === "gestor";

  try {
    const supabase = getSupabase();
    const tenantId = await tenantIdAtual(supabase);
    if (!(await optionBelongsToQuote(supabase, tenantId, optionId, quoteId))) {
      return bad("Opcao nao pertence a esta cotacao.", "nao_encontrado", 404);
    }

    let result;
    try {
      result = await addManualDiscount(
        supabase,
        {
          tenantId,
          optionId,
          itemId,
          type: type as (typeof TYPES)[number],
          value,
          appliesTo,
          reason,
          tetoPercent: Number.isFinite(teto) ? teto : undefined,
          permitirOverride: isGestor,
        },
        { usuario: g.usuario, ip: g.ip },
      );
    } catch (e) {
      if (e instanceof DescontoAcimaDoTeto) {
        return bad(e.message, "acima_do_teto", 403);
      }
      throw e;
    }

    // Override: gestor ultrapassou o teto — registra justificativa dedicada.
    if (result.overrideTeto) {
      await registrarAuditoriaAdmin(supabase, {
        usuario: g.usuario,
        acao: "quote.discount.override_teto",
        alvo: result.discountId,
        detalhe: { optionId, itemId: itemId ?? null, type, value, teto, reason },
        ip: g.ip,
      });
    }

    return okData(result);
  } catch (err) {
    return fail(err);
  }
}
