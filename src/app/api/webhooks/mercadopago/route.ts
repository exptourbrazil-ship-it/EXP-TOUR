import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  verificarAssinaturaMercadoPago,
  extrairPaymentId,
  montarIdempotencyKey,
} from "@/lib/mp-events";
import { processarPagamentoMercadoPago } from "@/lib/mp-processar-pagamento";

export const runtime = "nodejs";

// Webhook do Mercado Pago (notificacao de mudanca de status de pagamento).
//
// Endurecido conforme o item 1 do plano v2 (padrao do barramento de eventos):
//  - valida a assinatura HMAC (header x-signature) quando o secret esta
//    configurado (MERCADOPAGO_WEBHOOK_SECRET), rejeitando notificacoes forjadas;
//  - registra cada notificacao na tabela "events" (ledger) com a chave de
//    idempotencia mercadopago:payment:<id>, nunca aplicando o mesmo efeito
//    (marcar parcela como paga) duas vezes;
//  - registra tentativas e o erro, permitindo reprocessamento manual;
//  - devolve 500 em erro transitorio (consulta/DB) para o MP reenviar, e 200
//    quando processado, duplicado ou sem acao.

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  return createClient(supabaseUrl, serviceRoleKey);
}

export async function POST(request: Request) {
  const raw = await request.text();
  let body: unknown = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }

  const paymentId = extrairPaymentId({ url: request.url, body });

  // Notificacoes sem id de pagamento (ex.: merchant_order, testes do painel):
  // nada a fazer, respondemos 200 para o MP nao reenviar.
  if (!paymentId) {
    return NextResponse.json({ ok: true, ignorado: "sem payment id" });
  }

  // Validacao de assinatura. Com o secret configurado, exigimos assinatura
  // valida. Sem o secret (ambiente ainda nao configurado no painel do MP),
  // seguimos mas deixamos um aviso no log.
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  if (secret) {
    const assinaturaOk = verificarAssinaturaMercadoPago({
      signatureHeader: request.headers.get("x-signature"),
      requestId: request.headers.get("x-request-id"),
      dataId: paymentId,
      secret,
    });
    if (!assinaturaOk) {
      return NextResponse.json({ ok: false, erro: "assinatura invalida" }, { status: 401 });
    }
  } else {
    console.warn(
      "MERCADOPAGO_WEBHOOK_SECRET nao configurado: webhook aceito sem validacao de assinatura."
    );
  }

  const supabase = getSupabase();
  const idempotencyKey = montarIdempotencyKey("mercadopago", "payment", paymentId);

  // Ledger de idempotencia: se ja existe um evento processado para esta chave,
  // o efeito ja foi aplicado -> nao reprocessa.
  const { data: existente } = await supabase
    .from("events")
    .select("id, status, tentativas")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (existente?.status === "processado") {
    return NextResponse.json({ ok: true, duplicado: true });
  }

  let eventId = existente?.id as string | undefined;

  if (!eventId) {
    const { data: novo, error: insErr } = await supabase
      .from("events")
      .insert({
        source: "mercadopago",
        event_type: "payment",
        idempotency_key: idempotencyKey,
        external_id: paymentId,
        payload: body,
        status: "pendente",
        tentativas: 1,
      })
      .select("id")
      .single();

    if (insErr || !novo) {
      // Corrida: outro request criou a mesma chave entre o select e o insert.
      // Como idempotency_key e unica, tratamos como duplicado.
      return NextResponse.json({ ok: true, duplicado: true });
    }
    eventId = novo.id;
  } else {
    // Reprocessando um evento pendente/ignorado/erro: conta a nova tentativa e
    // guarda o payload mais recente.
    await supabase
      .from("events")
      .update({
        tentativas: (existente?.tentativas ?? 0) + 1,
        payload: body,
        updated_at: new Date().toISOString(),
      })
      .eq("id", eventId);
  }

  const resultado = await processarPagamentoMercadoPago(supabase, paymentId);

  if (resultado.status === "erro") {
    await supabase
      .from("events")
      .update({ status: "erro", erro: resultado.erro, updated_at: new Date().toISOString() })
      .eq("id", eventId);
    // Erro transitorio (consulta ao MP ou DB): devolve 500 para o MP reenviar.
    return NextResponse.json({ ok: false, erro: resultado.erro }, { status: 500 });
  }

  if (resultado.status === "ignorado") {
    await supabase
      .from("events")
      .update({ status: "ignorado", erro: null, updated_at: new Date().toISOString() })
      .eq("id", eventId);
    // Sem acao agora; se o pagamento for aprovado depois, a proxima notificacao
    // reprocessa esta mesma chave (status != processado).
    return NextResponse.json({ ok: true, ignorado: resultado.paymentStatus });
  }

  await supabase
    .from("events")
    .update({
      status: "processado",
      erro: null,
      processed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", eventId);

  return NextResponse.json({ ok: true, parcelasAtualizadas: resultado.parcelasAtualizadas });
}
