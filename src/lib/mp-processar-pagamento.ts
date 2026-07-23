// Efeito de negocio de um pagamento do Mercado Pago: consulta o pagamento e,
// se aprovado, marca a(s) parcela(s) correspondente(s) como paga(s).
//
// Isolado aqui para ser reutilizado pelo webhook e pela rota de reprocessamento
// manual do admin. Nao lanca: erros viram { status: "erro" } para o chamador
// decidir entre pedir retry (webhook -> 500) ou apenas reportar (admin).
import type { SupabaseClient } from "@supabase/supabase-js";
import { consultarPagamento } from "@/lib/mercadopago";

export type ResultadoProcessamento =
  | { status: "processado"; paymentStatus: string; parcelasAtualizadas: number }
  | { status: "ignorado"; paymentStatus: string }
  | { status: "erro"; erro: string };

export async function processarPagamentoMercadoPago(
  supabase: SupabaseClient,
  paymentId: string
): Promise<ResultadoProcessamento> {
  let pagamento: { status?: string };
  try {
    pagamento = await consultarPagamento(paymentId);
  } catch (err) {
    return { status: "erro", erro: err instanceof Error ? err.message : String(err) };
  }

  const paymentStatus = String(pagamento?.status || "desconhecido");
  if (paymentStatus !== "approved") {
    return { status: "ignorado", paymentStatus };
  }

  // Idempotente no nivel do banco: a clausula .neq garante que uma parcela ja
  // paga nao seja marcada de novo (paid_at preservado). Uma notificacao
  // aprovada duplicada simplesmente atualiza 0 linhas.
  const { data, error } = await supabase
    .from("parcelas")
    .update({ status: "pago", paid_at: new Date().toISOString() })
    .eq("external_payment_id", paymentId)
    .neq("status", "pago")
    .select("id");

  if (error) {
    return { status: "erro", erro: error.message };
  }

  return { status: "processado", paymentStatus, parcelasAtualizadas: data?.length ?? 0 };
}
