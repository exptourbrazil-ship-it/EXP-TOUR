// NB: modulo server-only (service role). So deve ser importado por rotas e
// server components — NUNCA por codigo client.
//
// Servico da BAIXA MANUAL de parcela (pagamento recebido "por fora" do Pix). E a
// mutacao NOMEADA unica: valida entrada -> aplica em transacao (funcao Postgres
// `registrar_pagamento_manual`, sob lock) -> grava o evento em `events` -> grava
// a trilha em `admin_audit`. Excecao controlada a regra "dinheiro so muda por
// webhook": a confirmacao vem de um admin financeiro autorizado (RBAC na rota),
// com o mesmo rigor de idempotencia e auditoria do webhook do Mercado Pago.
import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";

export class PagamentoManualBloqueado extends Error {
  codigo: string;
  constructor(codigo: string, mensagem?: string) {
    super(mensagem || codigo);
    this.name = "PagamentoManualBloqueado";
    this.codigo = codigo;
  }
}

export type ResultadoPagamentoManual = {
  ok: true;
  externalPaymentId: string;
  cotacao: number;
  saldoAposMoeda: number;
};

export type ResultadoEstorno = { ok: true; externalPaymentId: string };

// Codigos que a funcao Postgres levanta como raise (guarda-corpos revalidados sob
// lock). Qualquer outra falha e tratada como interna (falha_registrar).
const RAISES_REGISTRAR = new Set([
  "contrato_nao_encontrado",
  "parcela_nao_encontrada",
  "parcela_ja_paga",
  "parcela_em_disputa",
  "parcela_com_cobranca_em_voo",
  "valor_brl_invalido",
  "valor_programa_invalido",
  "referencia_invalida",
]);
const RAISES_ESTORNO = new Set([
  "parcela_nao_encontrada",
  "parcela_nao_paga",
  "nao_e_pagamento_manual",
]);

async function gravarEvento(
  supabase: SupabaseClient,
  eventType: string,
  idempotencyKey: string,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    const { error } = await supabase.from("events").insert({
      source: "admin",
      event_type: eventType,
      idempotency_key: idempotencyKey,
      payload,
      status: "processado",
      processed_at: new Date().toISOString(),
    });
    if (error && (error as { code?: string }).code !== "23505") {
      console.error("[pagamento-manual] falha ao gravar evento");
    }
  } catch {
    console.error("[pagamento-manual] excecao ao gravar evento");
  }
}

// Lanca uma baixa manual: marca a parcela como paga e grava o lancamento no
// ledger `pagamentos` numa transacao unica (funcao Postgres). O admin informa o
// BRL recebido e o valor na moeda do programa; a cotacao (VET) e calculada no
// banco. Idempotencia: parcela ja paga aborta; a referencia e sintetica
// (`manual:<uuid>`), casando com a unique do ledger.
export async function registrarPagamentoManual(args: {
  supabase: SupabaseClient;
  contratoId: string;
  parcelaId: string;
  valorBRL: number;
  valorPrograma: number;
  pagoEm: string; // ISO (YYYY-MM-DD ou timestamp)
  forma?: string | null;
  observacao?: string | null;
  autor: string;
  ip?: string | null;
}): Promise<ResultadoPagamentoManual> {
  const { supabase } = args;
  if (!args.contratoId || !args.parcelaId) throw new PagamentoManualBloqueado("dados_invalidos");
  if (!(Number(args.valorBRL) > 0)) throw new PagamentoManualBloqueado("valor_brl_invalido");
  if (!(Number(args.valorPrograma) > 0)) throw new PagamentoManualBloqueado("valor_programa_invalido");

  const externalPaymentId = `manual:${randomUUID()}`;
  const { data, error } = await supabase.rpc("registrar_pagamento_manual", {
    p_contrato_id: args.contratoId,
    p_parcela_id: args.parcelaId,
    p_valor_brl: args.valorBRL,
    p_valor_programa: args.valorPrograma,
    p_pago_em: args.pagoEm,
    p_external_payment_id: externalPaymentId,
  });
  if (error) {
    const msg = (error as { message?: string }).message ?? "";
    if (RAISES_REGISTRAR.has(msg)) throw new PagamentoManualBloqueado(msg);
    throw new PagamentoManualBloqueado("falha_registrar", msg);
  }

  const res = (data ?? {}) as { cotacao?: number; saldo_apos_moeda?: number };
  const cotacao = Number(res.cotacao) || 0;
  const saldoAposMoeda = Number(res.saldo_apos_moeda) || 0;

  await gravarEvento(supabase, "Pagamento_Manual_Registrado", `pagamento-manual:${externalPaymentId}`, {
    contrato_id: args.contratoId,
    parcela_id: args.parcelaId,
    external_payment_id: externalPaymentId,
    valor_brl: args.valorBRL,
    valor_programa: args.valorPrograma,
    cotacao,
    forma: args.forma ?? null,
  });
  await registrarAuditoriaAdmin(supabase, {
    usuario: args.autor,
    acao: "parcela.pagamento_manual",
    alvo: args.parcelaId,
    detalhe: {
      contrato_id: args.contratoId,
      external_payment_id: externalPaymentId,
      valor_brl: args.valorBRL,
      valor_programa: args.valorPrograma,
      cotacao,
      forma: args.forma ?? null,
      observacao: args.observacao ?? null,
      pago_em: args.pagoEm,
    },
    ip: args.ip ?? null,
  });

  return { ok: true, externalPaymentId, cotacao, saldoAposMoeda };
}

// Estorna uma baixa manual lancada errada. So reverte pagamentos manuais (o SQL
// recusa `nao_e_pagamento_manual` para qualquer coisa que nao seja `manual:%`).
export async function estornarPagamentoManual(args: {
  supabase: SupabaseClient;
  contratoId: string;
  parcelaId: string;
  motivo?: string | null;
  autor: string;
  ip?: string | null;
}): Promise<ResultadoEstorno> {
  const { supabase } = args;
  if (!args.contratoId || !args.parcelaId) throw new PagamentoManualBloqueado("dados_invalidos");

  const { data, error } = await supabase.rpc("estornar_pagamento_manual", {
    p_contrato_id: args.contratoId,
    p_parcela_id: args.parcelaId,
  });
  if (error) {
    const msg = (error as { message?: string }).message ?? "";
    if (RAISES_ESTORNO.has(msg)) throw new PagamentoManualBloqueado(msg);
    throw new PagamentoManualBloqueado("falha_estornar", msg);
  }
  const info = (data ?? {}) as { external_payment_id?: string; valor_brl?: number; valor_programa?: number; cotacao?: number };
  const externalPaymentId = String(info.external_payment_id ?? "");
  // Snapshot do que foi revertido (audit_log antes/depois).
  const antes = {
    valor_brl: info.valor_brl ?? null,
    valor_programa: info.valor_programa ?? null,
    cotacao: info.cotacao ?? null,
  };

  await gravarEvento(supabase, "Pagamento_Manual_Estornado", `pagamento-manual:estorno:${externalPaymentId || args.parcelaId}:${Date.now()}`, {
    contrato_id: args.contratoId,
    parcela_id: args.parcelaId,
    external_payment_id: externalPaymentId,
    antes,
    motivo: args.motivo ?? null,
  });
  await registrarAuditoriaAdmin(supabase, {
    usuario: args.autor,
    acao: "parcela.pagamento_manual.estorno",
    alvo: args.parcelaId,
    detalhe: { contrato_id: args.contratoId, external_payment_id: externalPaymentId, antes, motivo: args.motivo ?? null },
    ip: args.ip ?? null,
  });

  return { ok: true, externalPaymentId };
}
