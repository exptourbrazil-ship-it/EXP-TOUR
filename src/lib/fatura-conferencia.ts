// Veredito PURO da conferencia de fatura (doc 05 secao 1/2). Sem rede/DB: cruza
// a fatura extraida contra a previsao do caso e diz o que divergiu. Testado em
// fatura-conferencia.test.ts.
//
// Filosofia (doc 05): automatico por padrao, humano so na excecao. Verificacoes
// CRITICAS (moeda, valor, estudante) travam a fila (amarelo); INFORMATIVAS so
// avisam. A conferencia NUNCA move dinheiro — so classifica.

export type Severidade = "critica" | "informativa";
export type Divergencia = { campo: string; fatura: string; esperado: string; severidade: Severidade };
// 'indeterminado' = nao deu para verificar (faltou um comparador essencial:
// valor esperado do contrato, moeda, nome, ou uma das duas faturas). NUNCA vira
// "conferida" — trava a fila para olho humano, como uma divergencia.
export type StatusVeredito = "conferida" | "divergente" | "indeterminado";
export type VeredictoFatura = {
  status: StatusVeredito;
  divergencias: Divergencia[];
  commission: number | null; // gross - net (quando ambas presentes)
  remeter: number | null; // valor a remeter = net (quando presente)
};

export type PrevisaoConferencia = {
  grossAmount: number | null; // bruto esperado (valor_total do contrato)
  currency: string | null; // moeda do contrato
  estudanteNome: string | null;
};

// Um lado do par (fatura gross OU net) ja extraido.
export type LadoFatura = { amount: number | null; currency: string | null; studentName?: string | null } | null;

// Tolerancia padrao do valor bruto (fatura vs contrato): 2%.
const TOLERANCIA_VALOR_PCT = 0.02;
// Similaridade minima de nome (fracao de tokens em comum) para considerar match.
const MIN_SIMILARIDADE_NOME = 0.6;

// Normaliza nome para comparacao: minusculas, sem acento, tokens ordenados.
function tokensNome(nome: string): string[] {
  return nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove diacriticos combinantes
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1); // ignora iniciais/ruido de 1 letra
}

// Similaridade de nomes por sobreposicao de tokens (Jaccard sobre o menor
// conjunto): tolerante a ordem, acento e caixa. 1 = todos os tokens do menor
// nome estao no maior.
export function similaridadeNome(a: string, b: string): number {
  const ta = new Set(tokensNome(a));
  const tb = new Set(tokensNome(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let comuns = 0;
  const [menor, maior] = ta.size <= tb.size ? [ta, tb] : [tb, ta];
  for (const t of menor) if (maior.has(t)) comuns++;
  return comuns / menor.size;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// Confere o PAR de faturas (gross + net) contra a previsao do caso. Puro e
// defensivo. A escola manda a gross (preco cheio do programa) e a net (o que a
// EXP Tour remete). Aqui:
//   - gross confere contra o valor do contrato (previsao);
//   - a comissao sai de gross - net (nao depende do acordo cadastrado);
//   - o valor a remeter e o net.
// Verde so quando as DUAS faturas existem, batem entre si (net < gross) e o
// gross casa com o contrato; qualquer buraco -> amarelo (indeterminado) e
// divergencia real -> vermelho (divergente).
export function conferirFaturas(input: {
  gross: LadoFatura;
  net: LadoFatura;
  previsao: PrevisaoConferencia;
  toleranciaValorPct?: number;
}): VeredictoFatura {
  const { gross, net, previsao } = input;
  const tol = typeof input.toleranciaValorPct === "number" && input.toleranciaValorPct >= 0 ? input.toleranciaValorPct : TOLERANCIA_VALOR_PCT;
  const divergencias: Divergencia[] = [];
  const naoVerificado: Divergencia[] = [];

  const grossAmount = gross?.amount ?? null;
  const netAmount = net?.amount ?? null;
  const commission = grossAmount != null && netAmount != null && netAmount <= grossAmount ? round2(grossAmount - netAmount) : null;
  const remeter = netAmount;

  // PRESENCA das duas faturas.
  if (grossAmount == null) naoVerificado.push({ campo: "Fatura gross", fatura: "ausente/não extraída", esperado: fmt(previsao.grossAmount), severidade: "informativa" });
  if (netAmount == null) naoVerificado.push({ campo: "Fatura net", fatura: "ausente/não extraída", esperado: "—", severidade: "informativa" });

  // GROSS vs contrato (tolerancia). So quando ha gross e valor no contrato.
  if (grossAmount != null && previsao.grossAmount != null && previsao.grossAmount > 0) {
    const diff = Math.abs(grossAmount - previsao.grossAmount);
    if (diff / previsao.grossAmount > tol) {
      divergencias.push({ campo: "Valor gross", fatura: fmt(grossAmount), esperado: fmt(previsao.grossAmount), severidade: "critica" });
    }
  } else if (grossAmount != null && (previsao.grossAmount == null || previsao.grossAmount <= 0)) {
    naoVerificado.push({ campo: "Valor gross", fatura: fmt(grossAmount), esperado: "sem valor no contrato", severidade: "informativa" });
  }

  // COERENCIA gross/net: net tem que ser <= gross (a comissao nao pode ser negativa).
  if (grossAmount != null && netAmount != null && netAmount > grossAmount) {
    divergencias.push({ campo: "Net vs gross", fatura: fmt(netAmount), esperado: `≤ ${fmt(grossAmount)}`, severidade: "critica" });
  }

  // COMISSAO IMPLAUSIVEL: net muito baixo vs gross (ex.: typo 425 em vez de 4250)
  // gera comissao > 90% do gross — improvavel em intercambio. Trava para conferir
  // (nunca deixa passar como verde um net com ordem de grandeza errada).
  if (commission != null && grossAmount != null && grossAmount > 0 && commission > 0.9 * grossAmount) {
    naoVerificado.push({ campo: "Comissão", fatura: `${fmt(commission)} (net muito baixo)`, esperado: `net plausível vs gross ${fmt(grossAmount)}`, severidade: "informativa" });
  }

  // MOEDA: gross, net e contrato devem casar (entre os presentes).
  const moedas = [gross?.currency, net?.currency, previsao.currency].map((m) => (m ? m.toUpperCase() : null)).filter(Boolean) as string[];
  const moedasUnicas = [...new Set(moedas)];
  if (moedasUnicas.length > 1) {
    divergencias.push({ campo: "Moeda", fatura: moedasUnicas.join(" / "), esperado: "iguais", severidade: "critica" });
  }
  // Fatura presente mas SEM moeda extraida (e contrato tem moeda) -> nao da para
  // validar a moeda daquela fatura -> indeterminado (nunca "conferida" falso).
  if (previsao.currency) {
    if (grossAmount != null && !gross?.currency) naoVerificado.push({ campo: "Moeda gross", fatura: "não extraída", esperado: previsao.currency.toUpperCase(), severidade: "informativa" });
    if (netAmount != null && !net?.currency) naoVerificado.push({ campo: "Moeda net", fatura: "não extraída", esperado: previsao.currency.toUpperCase(), severidade: "informativa" });
  }

  // ESTUDANTE: usa o nome da gross (fallback net) vs contrato.
  const nomeFatura = gross?.studentName || net?.studentName || null;
  if (nomeFatura && previsao.estudanteNome) {
    if (similaridadeNome(nomeFatura, previsao.estudanteNome) < MIN_SIMILARIDADE_NOME) {
      divergencias.push({ campo: "Estudante", fatura: nomeFatura, esperado: previsao.estudanteNome, severidade: "critica" });
    }
  } else if (previsao.estudanteNome) {
    naoVerificado.push({ campo: "Estudante", fatura: nomeFatura ?? "não extraído", esperado: previsao.estudanteNome, severidade: "informativa" });
  }

  const temCritica = divergencias.some((d) => d.severidade === "critica");
  if (temCritica) return { status: "divergente", divergencias, commission, remeter };
  if (naoVerificado.length > 0) return { status: "indeterminado", divergencias: naoVerificado, commission, remeter };
  return { status: "conferida", divergencias: [], commission, remeter };
}

function fmt(v: number | null): string {
  return v == null ? "—" : v.toFixed(2);
}
