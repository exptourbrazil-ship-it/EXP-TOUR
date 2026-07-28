// Helper puro para montar um lancamento do ledger de pagamentos (tabela
// "pagamentos"). Cada parcela paga gera um registro imutavel com o cambio
// aplicado e o montante em BRL efetivamente pago, alem do montante na moeda do
// programa. Mantido sem dependencia de rede/DB para ser testavel com o runner
// nativo do Node (ver CLAUDE.md).
//
// Fonte do BRL (em ordem de preferencia):
//  1. transaction_amount do pagamento do Mercado Pago -> o valor realmente pago;
//  2. valor_cobrado_brl da parcela -> o BRL cobrado na geracao do Pix (fallback);
//  3. valor_programa * cotacao_aplicada -> reconstrucao pela formula;
//  4. valor_programa -> contrato ja em BRL (sem cotacao).
//
// O valor na moeda do programa vem do valor_atual (valor efetivo, ja com os
// ajustes do cliente), com fallback ao valor_original.

export type PagamentoMP = {
  transaction_amount?: number | string | null;
  status?: string | null;
};

export type ParcelaLedger = {
  id: string;
  contrato_id: string;
  valor_original: number | string | null;
  valor_atual?: number | string | null;
  valor_cobrado_brl?: number | string | null;
  cotacao_aplicada?: number | string | null;
};

export type LancamentoPagamento = {
  parcela_id: string;
  contrato_id: string;
  external_payment_id: string;
  moeda: string;
  valor_programa: number;
  cotacao_aplicada: number | null;
  valor_brl: number;
  pago_em: string;
};

// Converte para numero finito ou null (trata "", null, undefined e lixo).
function numeroOuNulo(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === "") return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

// Arredonda para centavos (2 casas), como o resto do fluxo de cambio.
function centavos(valor: number): number {
  return Math.round(valor * 100) / 100;
}

export function montarLancamentoPagamento(params: {
  parcela: ParcelaLedger;
  moeda: string;
  paymentId: string;
  pagamentoMP: PagamentoMP;
  pagoEm: string;
}): LancamentoPagamento {
  const { parcela, moeda, paymentId, pagamentoMP, pagoEm } = params;

  const valorPrograma =
    numeroOuNulo(parcela.valor_atual) ?? numeroOuNulo(parcela.valor_original) ?? 0;
  const cotacao = numeroOuNulo(parcela.cotacao_aplicada);

  const valorBRL =
    numeroOuNulo(pagamentoMP.transaction_amount) ??
    numeroOuNulo(parcela.valor_cobrado_brl) ??
    (cotacao !== null ? centavos(valorPrograma * cotacao) : valorPrograma);

  return {
    parcela_id: parcela.id,
    contrato_id: parcela.contrato_id,
    external_payment_id: paymentId,
    moeda: moeda || "BRL",
    valor_programa: centavos(valorPrograma),
    cotacao_aplicada: cotacao,
    valor_brl: centavos(valorBRL),
    pago_em: pagoEm,
  };
}
