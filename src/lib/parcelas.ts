// Helpers puros de parcelas (sem rede/DB), para poderem ser testados sem mocks.

// Tolerancia padrao (em unidades da moeda do contrato) na comparacao entre a
// soma das parcelas e o total do contrato. Absorve arredondamento de centavos
// sem permitir divergencia real.
export const TOLERANCIA_SOMA_PARCELAS = 0.01;

// Soma os valores das parcelas, arredondando o resultado para centavos.
export function somaValoresParcelas(valores: number[]): number {
  const soma = valores.reduce((acc, v) => acc + (Number(v) || 0), 0);
  return Math.round(soma * 100) / 100;
}

// Valor efetivo da parcela na moeda do programa, ja com os ajustes do cliente.
// `valor_atual` guarda SEMPRE o valor na moeda do programa (o BRL cobrado no
// Pix vive na coluna `valor_cobrado_brl`, nao aqui). `valor_original` e o plano
// original imutavel, usado apenas para "Restaurar plano original".
export function valorProgramaAtual(p: { valor_atual: number | string }): number {
  return Number(p.valor_atual);
}

// Verifica se a soma dos valores das parcelas confere com o total do contrato,
// dentro da tolerancia. Comparacao feita na moeda do contrato (sem conversao).
export function somaParcelasConfere(
  valores: number[],
  valorTotal: number,
  tolerancia: number = TOLERANCIA_SOMA_PARCELAS
): boolean {
  // Comparacao feita em centavos inteiros para evitar erros de ponto
  // flutuante na fronteira da tolerancia (ex.: |99,99 - 100,00| que em float
  // resulta em 0,01000...9 e passaria falsamente do limite de 0,01).
  const soma = somaValoresParcelas(valores);
  const diffCents = Math.round(Math.abs(soma - valorTotal) * 100);
  const tolCents = Math.round(tolerancia * 100);
  return diffCents <= tolCents;
}
