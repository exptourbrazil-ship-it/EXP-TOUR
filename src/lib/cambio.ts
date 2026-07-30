// Conversao de câmbio para BRL.
//
// A `cotacao_vet` (tabela cotacoes_cambio) ja embute o câmbio comercial do
// BACEN do dia + spread + IOF (ver o cron atualizar-cambio). Portanto a
// conversao de um valor na moeda do contrato para BRL e apenas a multiplicacao
// pela cotacao, arredondada para centavos. NAO ha taxa administrativa fixa.
//
// Helper puro (sem rede/DB) para ser usado tanto na exibicao (/parcelas) quanto
// na geracao da cobranca (gerar-cobranca), garantindo que os dois usem
// exatamente a mesma formula.
export function converterParaBRL(valorOriginal: number, cotacaoVet: number): number {
  return Math.round(valorOriginal * cotacaoVet * 100) / 100;
}

// Percentuais padrao usados na composicao do VET (ver cron atualizar-cambio).
// Em producao vem das envs SPREAD_CAMBIO_PERCENTUAL / IOF_CAMBIO_PERCENTUAL.
export const SPREAD_PADRAO = 0.066;
export const IOF_PADRAO = 0.035;

export type ItensRecibo = {
  amortizacaoMoeda: number; // valor amortizado na moeda do programa
  ptax: number; // PTAX de venda (VET decomposto)
  subtotal: number; // amortizacaoMoeda x ptax (valor convertido)
  taxaPercentual: number; // ex.: 0.066
  taxaIntermediacao: number; // subtotal x taxaPercentual
  iofPercentual: number; // ex.: 0.035
  iof: number; // (subtotal + taxa) x iofPercentual
  totalBRL: number; // subtotal + taxa + iof (== valorPrograma x cotacaoVet)
};

// Decompoe uma conversao pela cotacao_vet nos itens do recibo (Clausula 6.5.2):
// PTAX, Taxa de Intermediacao e Cambio (6,6%) e IOF-cambio. A cotacao_vet embute
// PTAX x (1+spread) x (1+iof); reconstruimos cada parte com os MESMOS
// percentuais da composicao. `totalBRL` reproduz converterParaBRL. Puro.
export function itemizarRecibo(
  valorPrograma: number,
  cotacaoVet: number,
  spread: number = SPREAD_PADRAO,
  iof: number = IOF_PADRAO
): ItensRecibo {
  const c = (n: number) => Math.round(n * 100) / 100;
  const ptax = cotacaoVet / ((1 + spread) * (1 + iof));
  const subtotal = valorPrograma * ptax;
  const taxa = subtotal * spread;
  const iofValor = (subtotal + taxa) * iof;
  return {
    amortizacaoMoeda: c(valorPrograma),
    ptax: Math.round(ptax * 1e6) / 1e6,
    subtotal: c(subtotal),
    taxaPercentual: spread,
    taxaIntermediacao: c(taxa),
    iofPercentual: iof,
    iof: c(iofValor),
    totalBRL: c(subtotal + taxa + iofValor),
  };
}
