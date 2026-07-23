import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checarAdminCookie } from "@/lib/admin-guard";
import { montarIdempotencyKey } from "@/lib/mp-events";
import { processarPagamentoMercadoPago } from "@/lib/mp-processar-pagamento";

export const runtime = "nodejs";

// Reprocessa manualmente um evento de pagamento do Mercado Pago — para
// destravar casos que ficaram com status "erro" (ex.: falha transitoria de
// consulta ao MP na hora do webhook). Aceita { eventId } ou { paymentId }.
//
// A operacao e idempotente: reconsulta o pagamento no MP e so marca a parcela
// como paga se ainda nao estiver paga.
//
// Autenticacao: cookie de sessao de admin, com fallback ao Bearer
// ADMIN_CAMBIO_SECRET.
async function checarAuth(request: Request): Promise<boolean> {
  if (await checarAdminCookie()) return true;
  const adminSecret = process.env.ADMIN_CAMBIO_SECRET;
  if (!adminSecret) return false;
  return request.headers.get("authorization") === "Bearer " + adminSecret;
}

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  return createClient(supabaseUrl, serviceRoleKey);
}

export async function POST(request: Request) {
  if (!(await checarAuth(request))) {
    return NextResponse.json({ ok: false, erro: "Nao autorizado" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const eventId = body?.eventId ? String(body.eventId) : null;
  const paymentIdInput = body?.paymentId ? String(body.paymentId) : null;

  if (!eventId && !paymentIdInput) {
    return NextResponse.json({ ok: false, erro: "Informe 'eventId' ou 'paymentId'." }, { status: 400 });
  }

  const supabase = getSupabase();

  // Localiza o evento (por id, ou pela chave de idempotencia derivada do paymentId).
  const idempotencyKey = paymentIdInput
    ? montarIdempotencyKey("mercadopago", "payment", paymentIdInput)
    : null;

  const filtro = supabase
    .from("events")
    .select("id, external_id, status")
    .limit(1);
  const { data: evento } = eventId
    ? await filtro.eq("id", eventId).maybeSingle()
    : await filtro.eq("idempotency_key", idempotencyKey as string).maybeSingle();

  const paymentId = evento?.external_id || paymentIdInput;
  if (!paymentId) {
    return NextResponse.json({ ok: false, erro: "Evento nao encontrado e paymentId nao informado." }, { status: 404 });
  }

  const resultado = await processarPagamentoMercadoPago(supabase, paymentId);

  // Se o evento existe, atualiza seu status conforme o resultado. Se nao existe
  // (reprocesso por paymentId sem evento previo), apenas reporta o resultado.
  if (evento?.id) {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (resultado.status === "processado") {
      patch.status = "processado";
      patch.erro = null;
      patch.processed_at = new Date().toISOString();
    } else if (resultado.status === "ignorado") {
      patch.status = "ignorado";
      patch.erro = null;
    } else {
      patch.status = "erro";
      patch.erro = resultado.erro;
    }
    await supabase.from("events").update(patch).eq("id", evento.id);
  }

  const httpStatus = resultado.status === "erro" ? 502 : 200;
  return NextResponse.json({ ok: resultado.status !== "erro", paymentId, resultado }, { status: httpStatus });
}
