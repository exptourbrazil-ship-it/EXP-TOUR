// Regra de DURACAO da cotacao (decisao do usuario, 19/09/2026): a pesquisa e a
// cotacao trabalham com SEMANAS FECHADAS de 7 dias. Noite avulsa nao vira fracao
// de semana — entra como item complementar (add-on), com o preco de noite extra
// que a escola publica, que costuma ser bem maior que a semana dividida por 7
// (na NESE, 220 contra 111; na BELS, 70 contra 43). Ratear semana ali cobraria
// do aluno menos do que a escola cobra da agencia.
//
// Funcao PURA (sem rede/DB): e a mesma regra na rota, no construtor e no preview.

/** Unidades em que a quantidade precisa ser um numero inteiro. */
const UNIDADES_FECHADAS = new Set(["week", "month"]);

export type ChecagemDuracao = { ok: true; quantidade: number } | { ok: false; erro: string };

/**
 * Valida a duracao pedida. Semana e mes so aceitam inteiro >= 1; dia e unidade
 * seguem aceitando fracionario (um add-on de 3 noites, por exemplo).
 */
export function validarDuracao(quantity: unknown, unit: unknown): ChecagemDuracao {
  const n = typeof quantity === "string" ? Number(quantity.trim()) : typeof quantity === "number" ? quantity : NaN;
  if (!Number.isFinite(n) || n <= 0) return { ok: false, erro: "Informe uma quantidade maior que zero." };

  const u = typeof unit === "string" ? unit.trim() : "";
  if (!u) return { ok: false, erro: "Informe a unidade." };

  if (UNIDADES_FECHADAS.has(u) && !Number.isInteger(n)) {
    const rotulo = u === "week" ? "semanas" : "meses";
    return {
      ok: false,
      erro: `Use ${rotulo} fechadas (número inteiro). Noites avulsas entram como item complementar.`,
    };
  }
  return { ok: true, quantidade: n };
}

/** Noites de uma estadia em semanas fechadas (para conferencia e exibicao). */
export function noitesDeSemanas(semanas: number): number {
  return Math.round(semanas * 7);
}
