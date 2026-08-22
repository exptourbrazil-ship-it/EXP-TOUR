// NB: modulo server-only (service role). So deve ser importado por rotas/webhook
// e server components — NUNCA por codigo client.
//
// Automacao do processo E9 — CONTESTACAO DE PAGAMENTO (doc 01 §4). Funcao de
// mutacao unica (padrao doc 07 §4): dado um pagamento contestado no Mercado Pago
// (MED Pix / chargeback), congela o "efeito" do pagamento (flag em_disputa nas
// parcelas daquele pagamento — o status 'pago' e o ledger imutavel sao
// preservados) e abre o processo E9 no(s) contrato(s), que suspende o avanco da
// jornada e cai na Fila do Dia roteado ao Financeiro (papelAlvo do tipo).
//
// Idempotente: flag e set-true; E9 e aberta no maximo uma vez por contrato
// (indice unico parcial + excecao_ja_aberta tratado como sucesso). A resposta
// da disputa (ganhar/perder) e conduzida pelo Financeiro no Caso 360; perder
// vira inadimplencia (E5) — fora deste passo.
import type { SupabaseClient } from "@supabase/supabase-js";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";
import { abrirExcecao, ExcecaoBloqueada } from "@/lib/excecao-service";
import { montarIdempotencyKey } from "@/lib/mp-events";

export type ResultadoDisputa =
  | { status: "processado"; contratos: number; parcelas: number }
  | { status: "ignorado"; motivo: string }
  | { status: "erro"; erro: string };

// Registra a disputa de um pagamento. `paymentId` e o id do pagamento no MP;
// `statusMP` e o status de disputa (in_mediation | charged_back), so para
// registro/auditoria. `autor` identifica quem disparou ("sistema" no webhook).
export async function registrarDisputaPagamento(
  supabase: SupabaseClient,
  paymentId: string,
  statusMP: string,
  autor = "sistema"
): Promise<ResultadoDisputa> {
  // Parcelas deste pagamento (uma cobranca pode cobrir 1+ parcelas).
  const { data: parcelas, error: selErr } = await supabase
    .from("parcelas")
    .select("id, contrato_id, em_disputa")
    .eq("external_payment_id", paymentId);
  if (selErr) {
    return { status: "erro", erro: selErr.message };
  }
  if (!parcelas || parcelas.length === 0) {
    // Pagamento nao corresponde a nenhuma parcela nossa: nada a fazer (mesmo
    // criterio do resto do webhook — nao agimos sobre ids desconhecidos).
    return { status: "ignorado", motivo: "sem parcela correspondente" };
  }

  // 1. Congela o efeito: marca as parcelas como em disputa (idempotente).
  const { error: updErr } = await supabase
    .from("parcelas")
    .update({ em_disputa: true, disputa_status: statusMP })
    .eq("external_payment_id", paymentId);
  if (updErr) {
    return { status: "erro", erro: updErr.message };
  }

  // 2. Abre o E9 em cada contrato afetado (dedupe por instancia; ja_aberta = ok).
  const contratoIds = Array.from(new Set(parcelas.map((p) => p.contrato_id as string)));
  for (const contratoId of contratoIds) {
    try {
      await abrirExcecao({
        contratoId,
        tipo: "disputa_pagamento",
        motivo: `Disputa de pagamento no Mercado Pago (${statusMP}; payment ${paymentId})`,
        autor,
      });
    } catch (err) {
      if (!(err instanceof ExcecaoBloqueada && err.codigo === "excecao_ja_aberta")) {
        return { status: "erro", erro: err instanceof Error ? err.message : String(err) };
      }
    }
    await registrarAuditoriaAdmin(supabase, {
      usuario: autor,
      acao: "disputa.registrar",
      alvo: contratoId,
      detalhe: { payment_id: paymentId, status_mp: statusMP },
      ip: null,
    });
  }

  return { status: "processado", contratos: contratoIds.length, parcelas: parcelas.length };
}

export type OutcomeDisputaLedger = "duplicado" | "processado" | "ignorado" | "erro";
export type ResultadoDisputaLedger = {
  outcome: OutcomeDisputaLedger;
  erro?: string;
  motivo?: string;
  contratos?: number;
};

// Trata uma disputa COM o ledger de idempotencia proprio
// (mercadopago:dispute:<id>), separado do de pagamento — a contestacao chega
// depois da aprovacao, cujo evento payment:<id> ja e 'processado'. Idempotente:
// uma vez 'processado', reentregas curto-circuitam. Reutilizada pelo webhook,
// pelo cron de conciliacao e pelo reprocesso manual do admin, para que os tres
// gravem a MESMA trilha e nao corrompam o evento de PAGAMENTO.
export async function tratarDisputaLedger(
  supabase: SupabaseClient,
  paymentId: string,
  statusMP: string,
  payload: unknown
): Promise<ResultadoDisputaLedger> {
  const disputaKey = montarIdempotencyKey("mercadopago", "dispute", paymentId);
  const agora = () => new Date().toISOString();

  const { data: existente } = await supabase
    .from("events")
    .select("id, status, tentativas")
    .eq("idempotency_key", disputaKey)
    .maybeSingle();

  if (existente?.status === "processado") {
    return { outcome: "duplicado" };
  }

  let eventId = existente?.id as string | undefined;
  if (!eventId) {
    const { data: novo, error: insErr } = await supabase
      .from("events")
      .insert({
        source: "mercadopago",
        event_type: "dispute",
        idempotency_key: disputaKey,
        external_id: paymentId,
        payload: payload ?? null,
        status: "pendente",
        tentativas: 1,
      })
      .select("id")
      .single();
    // Corrida na chave unica: outra entrega criou a mesma. Tratamos como duplicado.
    if (insErr || !novo) return { outcome: "duplicado" };
    eventId = novo.id;
  } else {
    await supabase
      .from("events")
      .update({ tentativas: (existente?.tentativas ?? 0) + 1, updated_at: agora() })
      .eq("id", eventId);
  }

  const res = await registrarDisputaPagamento(supabase, paymentId, statusMP);

  if (res.status === "erro") {
    await supabase
      .from("events")
      .update({ status: "erro", erro: res.erro, updated_at: agora() })
      .eq("id", eventId);
    return { outcome: "erro", erro: res.erro };
  }
  if (res.status === "ignorado") {
    await supabase
      .from("events")
      .update({ status: "ignorado", erro: null, updated_at: agora() })
      .eq("id", eventId);
    return { outcome: "ignorado", motivo: res.motivo };
  }

  await supabase
    .from("events")
    .update({ status: "processado", erro: null, processed_at: agora(), updated_at: agora() })
    .eq("id", eventId);
  return { outcome: "processado", contratos: res.contratos };
}
