import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { montarIdempotencyKey } from "@/lib/mp-events";
import { extrairEventoSign } from "@/lib/sign-events";
import { processarEventoSign } from "@/lib/sign-processar";

export const runtime = "nodejs";

// Webhook do Zoho Sign, no padrao do barramento de eventos (igual ao Mercado
// Pago):
//  - registra cada notificacao na tabela "events" com a chave
//    zoho_sign:envelope:<id>:<status> (uma linha por transicao, pois um mesmo
//    envelope passa por varios status);
//  - nunca aplica o mesmo efeito duas vezes (dedupe por status 'processado' +
//    idempotencia no proprio efeito via documento_id);
//  - registra tentativas/erro e permite reprocessamento manual;
//  - devolve 500 em erro transitorio (Zoho reenvia) e 200 quando
//    processado/duplicado/ignorado.
//
// Seguranca: se ZOHO_SIGN_WEBHOOK_SECRET estiver configurado, exige um token
// correspondente em ?token= ou no header x-exp-webhook-token. Sem o secret,
// aceita com aviso no log (ambiente ainda nao configurado).

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  return createClient(supabaseUrl, serviceRoleKey);
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  // Falha FECHADO. Sem o secret, qualquer um que soubesse um envelope_id_zoho
  // podia postar {"request_status":"declined"} e marcar a assinatura daquele
  // contrato como recusada.
  const secret = process.env.ZOHO_SIGN_WEBHOOK_SECRET;
  if (!secret) {
    console.error("ZOHO_SIGN_WEBHOOK_SECRET nao configurado: webhook recusado.");
    return NextResponse.json({ ok: false, erro: "Webhook nao configurado" }, { status: 503 });
  }

  // Preferimos o header. Aceitar o secret por ?token= o deposita nos logs de
  // acesso da Vercel e em qualquer Referer — mantido so por compatibilidade
  // com a configuracao atual no Zoho.
  const token = request.headers.get("x-exp-webhook-token") || url.searchParams.get("token") || "";
  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  // Comparacao em tempo constante: `!==` sai no primeiro byte diferente.
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return NextResponse.json({ ok: false, erro: "token invalido" }, { status: 401 });
  }

  const raw = await request.text();
  let body: any = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }

  const ev = extrairEventoSign(body);
  if (!ev) {
    // Sem request_id identificavel: nada a fazer.
    return NextResponse.json({ ok: true, ignorado: "sem request_id" });
  }

  const supabase = getSupabase();
  const idempotencyKey = montarIdempotencyKey("zoho_sign", "envelope", `${ev.envelopeId}:${ev.status}`);

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
        source: "zoho_sign",
        event_type: "assinatura",
        idempotency_key: idempotencyKey,
        external_id: ev.envelopeId,
        payload: body,
        status: "pendente",
        tentativas: 1,
      })
      .select("id")
      .single();
    if (insErr || !novo) {
      // Corrida na mesma chave: trata como duplicado.
      return NextResponse.json({ ok: true, duplicado: true });
    }
    eventId = novo.id;
  } else {
    await supabase
      .from("events")
      .update({
        tentativas: (existente?.tentativas ?? 0) + 1,
        payload: body,
        updated_at: new Date().toISOString(),
      })
      .eq("id", eventId);
  }

  const resultado = await processarEventoSign(supabase, body);
  const agora = new Date().toISOString();

  if (resultado.status === "erro") {
    await supabase
      .from("events")
      .update({ status: "erro", erro: resultado.erro, updated_at: agora })
      .eq("id", eventId);
    return NextResponse.json({ ok: false, erro: resultado.erro }, { status: 500 });
  }

  if (resultado.status === "ignorado") {
    await supabase
      .from("events")
      .update({ status: "ignorado", erro: null, updated_at: agora })
      .eq("id", eventId);
    return NextResponse.json({ ok: true, ignorado: resultado.motivo });
  }

  await supabase
    .from("events")
    .update({ status: "processado", erro: null, processed_at: agora, updated_at: agora })
    .eq("id", eventId);

  return NextResponse.json({ ok: true, resultado: resultado.motivo });
}
