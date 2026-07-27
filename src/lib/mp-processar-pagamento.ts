// Efeito de negocio de um pagamento do Mercado Pago: consulta o pagamento e,
// se aprovado, marca a(s) parcela(s) correspondente(s) como paga(s).
//
// Isolado aqui para ser reutilizado pelo webhook e pela rota de reprocessamento
// manual do admin. Nao lanca: erros viram { status: "erro" } para o chamador
// decidir entre pedir retry (webhook -> 500) ou apenas reportar (admin).
import type { SupabaseClient } from "@supabase/supabase-js";
import { consultarPagamento } from "@/lib/mercadopago";
import { montarLancamentoPagamento } from "@/lib/pagamento-ledger";

export type ResultadoProcessamento =
  | { status: "processado"; paymentStatus: string; parcelasAtualizadas: number }
  | { status: "ignorado"; paymentStatus: string }
  | { status: "erro"; erro: string };

export async function processarPagamentoMercadoPago(
  supabase: SupabaseClient,
  paymentId: string
): Promise<ResultadoProcessamento> {
  let pagamento: { status?: string; transaction_amount?: number | string | null };
  try {
    pagamento = await consultarPagamento(paymentId);
  } catch (err) {
    return { status: "erro", erro: err instanceof Error ? err.message : String(err) };
  }

  const paymentStatus = String(pagamento?.status || "desconhecido");
  if (paymentStatus !== "approved") {
    return { status: "ignorado", paymentStatus };
  }

  const agora = new Date().toISOString();

  // Busca as parcelas deste pagamento COM os dados do ledger (moeda do
  // contrato, valor na moeda do programa e cotacao aplicada). Independe do
  // status para que um reprocessamento (parcela ja paga) ainda consiga
  // (re)gravar o lancamento do ledger de forma idempotente.
  const { data: parcelasPagamento, error: selErr } = await supabase
    .from("parcelas")
    .select("id, contrato_id, valor_original, valor_atual, cotacao_aplicada, paid_at, contrato:contratos(moeda)")
    .eq("external_payment_id", paymentId);

  if (selErr) {
    return { status: "erro", erro: selErr.message };
  }

  // Idempotente no nivel do banco: a clausula .neq garante que uma parcela ja
  // paga nao seja marcada de novo (paid_at preservado). Uma notificacao
  // aprovada duplicada simplesmente atualiza 0 linhas.
  const { data, error } = await supabase
    .from("parcelas")
    .update({ status: "pago", paid_at: agora })
    .eq("external_payment_id", paymentId)
    .neq("status", "pago")
    .select("id");

  if (error) {
    return { status: "erro", erro: error.message };
  }

  // Ledger de cambio: um lancamento imutavel por parcela paga, com o BRL
  // efetivamente pago e a cotacao aplicada. Upsert por (parcela_id,
  // external_payment_id) -> reprocessar nao duplica. Uma falha aqui e fatal
  // (retorna "erro") de proposito: o ledger e registro contabil e a proxima
  // tentativa do MP reprocessa a mesma chave ate gravar.
  for (const parcela of parcelasPagamento ?? []) {
    const contrato = (parcela as { contrato?: { moeda?: string | null } }).contrato;
    // Mantem o momento original do pagamento quando a parcela ja estava paga
    // (reprocessamento); usa "agora" quando foi marcada paga nesta execucao.
    const pagoEm = (parcela as { paid_at?: string | null }).paid_at || agora;
    const lancamento = montarLancamentoPagamento({
      parcela,
      moeda: contrato?.moeda || "BRL",
      paymentId,
      pagamentoMP: pagamento,
      pagoEm,
    });

    const { error: ledgerErr } = await supabase
      .from("pagamentos")
      .upsert(lancamento, { onConflict: "parcela_id,external_payment_id" });

    if (ledgerErr) {
      return { status: "erro", erro: `Falha ao gravar ledger de pagamento: ${ledgerErr.message}` };
    }
  }

  return { status: "processado", paymentStatus, parcelasAtualizadas: data?.length ?? 0 };
}
