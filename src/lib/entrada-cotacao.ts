// ENTRADA de uma opção de cotação: quanto o estudante precisa pagar de cara,
// na moeda do curso. É o que o simulador de parcelas do portal financia: a
// parcela é (líquido − entrada) ÷ N.
//
// Regra, em ordem de precedência:
//   1. `deposit_amount` da opção, quando o consultor definiu um. É uma decisão
//      explícita e vence qualquer cálculo.
//   2. Soma das taxas cobradas UMA VEZ e não reembolsáveis. Taxa `per_unit`
//      (material por semana) é recorrente, faz parte do curso, não da entrada.
//
// `is_refundable` nulo conta como NÃO reembolsável — mesma convenção de
// `orcamento-catalogo.ts`, e coerente com o catálogo do tenant, onde nenhuma
// taxa é marcada como reembolsável (só `false` ou nulo). Se um dia houver taxa
// reembolsável de verdade, ela precisa vir com `is_refundable = true`, senão
// entra na entrada indevidamente.
//
// NB: módulo PURO — sem dependência de rede/DB. Testado em entrada-cotacao.test.ts.

// Bases de cobrança que representam pagamento ÚNICO (entram na entrada).
// `per_unit` fica fora por ser recorrente (material por semana faz parte do
// curso). `seasonal` (gravado por gravarLinhasSazonais) também fica fora: é
// ajuste do preço da acomodação, não taxa de entrada.
const BASES_UNICAS = new Set(["once_per_item", "once_per_quote", "per_person"]);

/**
 * A matrícula de cotação com 2+ cursos é FUNDIDA numa linha só pelo motor, que
 * grava `basis = "registration:<regra>"` para deixar no rastro qual regra
 * agregou (charge_all / charge_highest / charge_lowest). Essa base não estava
 * em BASES_UNICAS, então a matrícula — a taxa que mais define a entrada —
 * ficava FORA dela em toda cotação multi-curso, e a agência recebia a menos.
 * Continua sendo pagamento único: uma matrícula, cobrada uma vez.
 */
function ehBaseUnica(basis: string): boolean {
  return BASES_UNICAS.has(basis) || basis.startsWith("registration:");
}

export type TaxaParaEntrada = {
  amount: number;
  currency: string | null;
  isRefundable: boolean | null;
  basis: string | null;
};

/**
 * Entrada da opção, na moeda da opção. `deposit` vence quando presente
 * (inclusive zero: "sem entrada" é uma decisão válida do consultor).
 */
export function entradaDaOpcao(args: {
  /** Moeda da opção: a entrada só pode somar valores DESTA moeda. */
  moeda: string;
  deposit: number | null;
  depositCurrency: string | null;
  taxas: TaxaParaEntrada[];
}): number {
  // Depósito em OUTRA moeda não pode ser subtraído do líquido da opção — seria
  // somar libra com real. Nesse caso cai no cálculo por taxas.
  const depositoServe =
    args.deposit != null &&
    Number.isFinite(args.deposit) &&
    (args.depositCurrency == null || args.depositCurrency === args.moeda);
  if (depositoServe) {
    return Math.max(0, Math.round((args.deposit as number) * 100) / 100);
  }
  let soma = 0;
  for (const t of args.taxas) {
    if (t.isRefundable === true) continue;
    if (!t.basis || !ehBaseUnica(t.basis)) continue;
    // Mesma razão: taxa em outra moeda fica de fora da entrada.
    if (t.currency && t.currency !== args.moeda) continue;
    const v = Number(t.amount);
    if (Number.isFinite(v) && v > 0) soma += v;
  }
  return Math.round(soma * 100) / 100;
}
