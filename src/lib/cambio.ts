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
