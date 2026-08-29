// Efeito de negocio de um pagamento do Mercado Pago: consulta o pagamento e,
// se aprovado, marca a(s) parcela(s) correspondente(s) como paga(s).
//
// Isolado aqui para ser reutilizado pelo webhook e pela rota de reprocessamento
// manual do admin. Nao lanca: erros viram { status: "erro" } para o chamador
// decidir entre pedir retry (webhook -> 500) ou apenas reportar (admin).
import type { SupabaseClient } from "@supabase/supabase-js";
import { consultarPagamento } from "@/lib/mercadopago";
import { montarLancamentoPagamento } from "@/lib/pagamento-ledger";
import { itemizarRecibo } from "@/lib/cambio";
import { enviarReciboPagamentoEmail } from "@/lib/email";
import { slugDoTenant } from "@/lib/tenant-slug";
import { ehStatusDisputaMP } from "@/lib/mp-disputa";

export type ResultadoProcessamento =
  | { status: "processado"; paymentStatus: string; parcelasAtualizadas: number }
  | { status: "disputa"; paymentStatus: string } // contestado (MED Pix/chargeback) -> E9
  | { status: "ignorado"; paymentStatus: string }
  | { status: "erro"; erro: string };

export async function processarPagamentoMercadoPago(
  supabase: SupabaseClient,
  paymentId: string
): Promise<ResultadoProcessamento> {
  let pagamento: { status?: string; transaction_amount?: number | string | null } | null;
  try {
    pagamento = await consultarPagamento(paymentId);
  } catch (err) {
    return { status: "erro", erro: err instanceof Error ? err.message : String(err) };
  }

  // Pagamento nao encontrado no MP (404): nada a fazer e nao adianta retentar.
  // Tratamos como "ignorado" para o webhook responder 200 e o MP parar de
  // reentregar (ex.: id ficticio do "Simular notificacao").
  if (!pagamento) {
    return { status: "ignorado", paymentStatus: "nao_encontrado" };
  }

  const paymentStatus = String(pagamento?.status || "desconhecido");
  // Contestacao (MED Pix / chargeback): nao aplica nem reverte o efeito aqui —
  // sinaliza para o chamador (webhook) abrir o processo E9 sob o seu proprio
  // ledger de idempotencia (dispute:<id>), separado do de pagamento.
  if (ehStatusDisputaMP(paymentStatus)) {
    return { status: "disputa", paymentStatus };
  }
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
    .select("id, contrato_id, descricao, valor_original, valor_atual, valor_cobrado_brl, cotacao_aplicada, paid_at, contrato:contratos(moeda)")
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

  // Recibo itemizado por e-mail (Clausula 6.5.2), best-effort: NUNCA derruba o
  // processamento. So para parcelas recem-marcadas como pagas (evita reenviar
  // em reprocessamento) e com cambio aplicado (pula contratos em BRL).
  try {
    const idsNovos = new Set((data ?? []).map((p: { id: string }) => p.id));
    const recemPagas = (parcelasPagamento ?? []).filter((p: any) => idsNovos.has(p.id));
    if (recemPagas.length > 0) {
      const spread = Number(process.env.SPREAD_CAMBIO_PERCENTUAL || "0.05");
      const iof = Number(process.env.IOF_CAMBIO_PERCENTUAL || "0.035");
      const fmt = (iso: string) =>
        new Intl.DateTimeFormat("pt-BR", {
          timeZone: "America/Sao_Paulo",
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }).format(new Date(iso));

      for (const p of recemPagas as any[]) {
        const moeda = p.contrato?.moeda || "BRL";
        const vet = Number(p.cotacao_aplicada);
        const valorPrograma = Number(p.valor_atual) || 0;
        if (!Number.isFinite(vet) || vet <= 0 || valorPrograma <= 0) continue; // sem cambio

        const { data: contrato } = await supabase
          .from("contratos")
          .select("titular_id")
          .eq("id", p.contrato_id)
          .maybeSingle();
        if (!contrato?.titular_id) continue;

        const { data: titular } = await supabase
          .from("titulares")
          .select("nome_completo, email, tenant_id")
          .eq("id", contrato.titular_id)
          .maybeSingle();
        if (!titular?.email) continue;
        const slug = await slugDoTenant(supabase, titular.tenant_id);

        const { data: abertas } = await supabase
          .from("parcelas")
          .select("valor_atual")
          .eq("contrato_id", p.contrato_id)
          .neq("status", "pago");
        const saldo = (abertas ?? []).reduce((s: number, x: any) => s + (Number(x.valor_atual) || 0), 0);

        const itens = itemizarRecibo(valorPrograma, vet, spread, iof);
        await enviarReciboPagamentoEmail(titular.email, titular.nome_completo || "", {
          dataFormatada: fmt(p.paid_at || agora),
          descricao: p.descricao || "Pagamento",
          moeda,
          ...itens,
          saldoRestanteMoeda: Math.round(saldo * 100) / 100,
        }, slug);
      }
    }
  } catch (err) {
    console.error("Falha ao enviar recibo de pagamento por e-mail:", err);
  }

  return { status: "processado", paymentStatus, parcelasAtualizadas: data?.length ?? 0 };
}
