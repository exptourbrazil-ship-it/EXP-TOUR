// Valor exibido de um item da cotação (puro, usado pela proposta e pelo PDF).
//
// Algumas acomodações vêm embutidas no preço do curso (ex.: casa de família da
// OISE Oxford) e ficam com tabela de preço de zero para poderem entrar na
// cotação. Mostrar "£ 0,00" sem contexto parece erro ou brinde; o cliente precisa
// ler que o valor já está no curso.

export const ROTULO_INCLUIDA_NO_CURSO = "Incluída no valor do curso";

/**
 * `formatado` é o valor já formatado em moeda. Só a acomodação com bruto exatamente
 * zero vira rótulo: zero em curso ou serviço seria um problema de dado que NÃO deve
 * ser disfarçado, e valor negativo (desconto, ex.: "Sem homestay") continua visível.
 */
export function valorExibidoDoItem(grupo: unknown, grossAmount: number, formatado: string): string {
  if (grupo === "accommodation" && grossAmount === 0) return ROTULO_INCLUIDA_NO_CURSO;
  return formatado;
}
