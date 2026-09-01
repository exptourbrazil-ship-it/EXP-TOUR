// Conversao de câmbio para BRL.
//
// A `cotacao_vet` (tabela cotacoes_cambio) ja embute o câmbio comercial do
// BACEN do dia + Taxa de Intermediacao e Cambio (spread) + IOF (ver
// comporCotacaoVet). Portanto a conversao de um valor na moeda do contrato para
// BRL e apenas a multiplicacao pela cotacao, arredondada para centavos. NAO ha
// taxa administrativa fixa.
//
// IMPORTANTE (Anexo II / Clausula 6.4 do contrato): o IOF-cambio incide sobre o
// VALOR CONVERTIDO (PTAX x valor), NAO sobre o spread. Por isso as aliquotas
// SOMAM (1 + spread + iof), em vez de multiplicar. Cobrar IOF sobre o spread
// seria tributar a remuneracao da EXP Tour, o que o contrato nao faz.
//
// Helper puro (sem rede/DB) para ser usado tanto na exibicao (/parcelas) quanto
// na geracao da cobranca (gerar-cobranca), garantindo que os dois usem
// exatamente a mesma formula.
export function converterParaBRL(valorOriginal: number, cotacaoVet: number): number {
  return Math.round(valorOriginal * cotacaoVet * 100) / 100;
}

// Percentuais padrao usados na composicao do VET (ver cron atualizar-cambio).
// Em producao vem das envs SPREAD_CAMBIO_PERCENTUAL / IOF_CAMBIO_PERCENTUAL.
// Spread de intermediacao e cambio = 5%; IOF-cambio = 3,5%.
export const SPREAD_PADRAO = 0.05;
export const IOF_PADRAO = 0.035;

// Percentuais VIGENTES ATE a mudanca do spread para 5% (spread era 6,6%). Usados
// SOMENTE como fallback na DECOMPOSICAO do recibo de cobrancas cuja VET foi
// congelada ANTES de passarmos a gravar o spread/iof aplicado na parcela. Assim,
// "o que ja foi pago/cobrado permanece como esta": um recibo antigo continua
// itemizado a 6,6%, mesmo que o spread vigente agora seja 5%.
export const SPREAD_LEGADO = 0.066;
export const IOF_LEGADO = 0.035;

// Compoe a cotacao VET a partir do cambio comercial (PTAX). Modelo ADITIVO: o
// IOF-cambio incide sobre o valor convertido, NAO sobre o spread, entao as
// aliquotas somam. Fonte unica usada pelo cron e pelo cambio manual do admin,
// para os dois nunca divergirem. Puro.
export function comporCotacaoVet(
  comercial: number,
  spread: number = SPREAD_PADRAO,
  iof: number = IOF_PADRAO
): number {
  return Math.round(comercial * (1 + spread + iof) * 1e6) / 1e6;
}

// Recupera o cambio comercial (PTAX) embutido numa VET, dado o spread/iof que a
// compuseram. Inverso EXATO de comporCotacaoVet (modelo aditivo: 1 + spread + iof).
// Puro.
export function extrairComercial(vet: number, spread: number, iof: number): number {
  return vet / (1 + spread + iof);
}

// Recompoe a VET para o spread/iof de um TENANT a partir de uma VET GLOBAL
// (composta com spreadArmazenado/iofArmazenado). A PTAX e global-por-moeda (taxa
// do BACEN, igual para todos): recuperamos ela da VET armazenada e recompomos com
// o spread/iof do tenant. Assim `cotacoes_cambio` permanece global (uma linha por
// moeda/dia) e a diferenca por instancia entra so na composicao. Se o spread/iof
// do tenant forem iguais aos armazenados, retorna a MESMA VET (idempotente, ate a
// precisao de 6 casas). Puro.
export function recomporVetTenant(
  vetArmazenada: number,
  spreadArmazenado: number,
  iofArmazenado: number,
  spreadTenant: number,
  iofTenant: number
): number {
  const comercial = extrairComercial(vetArmazenada, spreadArmazenado, iofArmazenado);
  return comporCotacaoVet(comercial, spreadTenant, iofTenant);
}

export type ItensRecibo = {
  amortizacaoMoeda: number; // valor amortizado na moeda do programa
  ptax: number; // PTAX de venda (VET decomposto)
  subtotal: number; // amortizacaoMoeda x ptax (valor convertido)
  taxaPercentual: number; // ex.: 0.05
  taxaIntermediacao: number; // subtotal x taxaPercentual
  iofPercentual: number; // ex.: 0.035
  iof: number; // subtotal x iofPercentual (aditivo: IOF sobre o valor convertido)
  totalBRL: number; // subtotal + taxa + iof (== valorPrograma x cotacaoVet)
};

// Decompoe uma conversao pela cotacao_vet nos itens do recibo (Clausula 6.5.2):
// PTAX, Taxa de Intermediacao e Cambio (5%) e IOF-cambio. A cotacao_vet embute
// PTAX x (1 + spread + iof) (modelo aditivo — IOF sobre o valor convertido, nao
// sobre o spread); reconstruimos cada parte com os MESMOS percentuais.
// `totalBRL` reproduz converterParaBRL. Puro.
export function itemizarRecibo(
  valorPrograma: number,
  cotacaoVet: number,
  spread: number = SPREAD_PADRAO,
  iof: number = IOF_PADRAO
): ItensRecibo {
  const c = (n: number) => Math.round(n * 100) / 100;
  const ptax = cotacaoVet / (1 + spread + iof);
  const subtotal = valorPrograma * ptax;
  const taxa = subtotal * spread;
  const iofValor = subtotal * iof; // IOF sobre o valor convertido, NAO sobre o spread
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
