// Vocabulário financeiro travado na Área do Cliente (Cláusula 7.13.x do contrato
// Forio): a interface nunca deve dizer "parcela"/"vencimento" para o plano
// SUGERIDO, sob pena de criar obrigação (parcelamento/crediário) que o contrato
// nega. PURO — sem imports de runtime — para ser testado sem mocks.
//
// Este helper normaliza a DESCRIÇÃO de um pagamento (que pode ter sido gravada
// como "Parcela 1/12" pelo webhook do CRM) para o rótulo permitido "Pagamento 1
// de 12". Passa adiante qualquer outro texto.

export function descricaoPagamento(descricao: string | null | undefined): string {
  const texto = (descricao ?? "").trim();
  if (!texto) return "Pagamento";
  // "Parcela 3/12" -> "Pagamento 3 de 12"
  const mFracao = texto.match(/^parcela\s+(\d+)\s*\/\s*(\d+)$/i);
  if (mFracao) return `Pagamento ${mFracao[1]} de ${mFracao[2]}`;
  // "Parcela 3" -> "Pagamento 3"
  const mUnica = texto.match(/^parcela\s+(\d+)$/i);
  if (mUnica) return `Pagamento ${mUnica[1]}`;
  // "Parcela" isolada (raro) -> "Pagamento"
  if (/^parcela$/i.test(texto)) return "Pagamento";
  return texto;
}
