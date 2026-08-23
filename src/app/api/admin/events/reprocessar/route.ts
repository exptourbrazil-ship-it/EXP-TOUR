import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checarCapacidadeAdmin, usuarioAdminAtual } from "@/lib/admin-guard";
import { montarIdempotencyKey } from "@/lib/mp-events";
import { processarPagamentoMercadoPago } from "@/lib/mp-processar-pagamento";
import { tratarDisputaLedger } from "@/lib/disputa-service";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";
import { obterIp } from "@/lib/rate-limit";

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
  if (await checarCapacidadeAdmin("config.gerir")) return true;
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
    .select("id, external_id, status, event_type")
    .limit(1);
  const { data: evento } = eventId
    ? await filtro.eq("id", eventId).maybeSingle()
    : await filtro.eq("idempotency_key", idempotencyKey as string).maybeSingle();

  const paymentId = evento?.external_id || paymentIdInput;
  if (!paymentId) {
    return NextResponse.json({ ok: false, erro: "Evento nao encontrado e paymentId nao informado." }, { status: 404 });
  }

  const resultado = await processarPagamentoMercadoPago(supabase, paymentId);

  // Disputa (E9): trata sob o ledger PROPRIO (dispute:<id>), como o webhook e o
  // cron. NAO marca o evento de PAGAMENTO como processado — nenhum efeito de
  // pagamento foi aplicado; marca-lo 'ignorado' preserva a reaplicacao futura
  // (se a disputa for resolvida a favor e o pagamento aprovar depois).
  let disputaErro: string | null = null;
  if (resultado.status === "disputa") {
    const dres = await tratarDisputaLedger(supabase, paymentId, resultado.paymentStatus, {
      origem: "admin:reprocessar",
    });
    if (dres.outcome === "erro") disputaErro = dres.erro ?? "Falha ao tratar a disputa";
  }

  // Atualiza o status do evento conforme o resultado — mas SO quando o evento
  // encontrado e o de PAGAMENTO. O evento de disputa (event_type='dispute') e
  // gerido exclusivamente por tratarDisputaLedger; toca-lo aqui sobrescreveria
  // (mascarando uma falha ou mentindo que uma disputa tratada nao foi). Se o
  // reprocesso e por paymentId sem evento previo, nada a patchar.
  if (evento?.id && evento.event_type === "payment") {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    let aplicar = true;
    if (resultado.status === "processado") {
      patch.status = "processado";
      patch.erro = null;
      patch.processed_at = new Date().toISOString();
    } else if (resultado.status === "ignorado") {
      patch.status = "ignorado";
      patch.erro = null;
    } else if (resultado.status === "disputa") {
      // NAO rebaixa um pagamento genuinamente aplicado ('processado' = parcela
      // paga + lancamento no ledger existem). So marca 'ignorado' quando o
      // efeito de pagamento nunca foi aplicado (estava erro/pendente). A trilha
      // da disputa vive no evento dispute:<id> (tratarDisputaLedger).
      if (evento.status !== "processado") {
        patch.status = "ignorado";
        patch.erro = null;
      } else {
        aplicar = false; // mantem 'processado'; disputa fica no dispute:<id>
      }
    } else {
      patch.status = "erro";
      patch.erro = resultado.erro;
    }
    if (aplicar) await supabase.from("events").update(patch).eq("id", evento.id);
  }

  const usuario = (await usuarioAdminAtual()) ?? "bearer-secret";
  await registrarAuditoriaAdmin(supabase, {
    usuario,
    acao: "evento.reprocessar",
    alvo: paymentId,
    detalhe: { eventId: evento?.id ?? null, status: resultado.status },
    ip: obterIp(request),
  });

  const falhou = resultado.status === "erro" || !!disputaErro;
  const httpStatus = falhou ? 502 : 200;
  return NextResponse.json({ ok: !falhou, paymentId, resultado }, { status: httpStatus });
}
