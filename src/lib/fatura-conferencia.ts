// Veredito PURO da conferencia de fatura (doc 05 secao 1/2). Sem rede/DB: cruza
// a fatura extraida contra a previsao do caso e diz o que divergiu. Testado em
// fatura-conferencia.test.ts.
//
// Filosofia (doc 05): automatico por padrao, humano so na excecao. Verificacoes
// CRITICAS (moeda, valor, estudante) travam a fila (amarelo); INFORMATIVAS so
// avisam. A conferencia NUNCA move dinheiro — so classifica.
import type { FaturaExtraida } from "@/lib/fatura-extract";

export type Severidade = "critica" | "informativa";
export type Divergencia = { campo: string; fatura: string; esperado: string; severidade: Severidade };
// 'indeterminado' = nao deu para verificar (faltou um comparador essencial:
// valor esperado do contrato, moeda ou nome na fatura). NUNCA vira "conferida" —
// trava a fila para olho humano, como uma divergencia.
export type StatusVeredito = "conferida" | "divergente" | "indeterminado";
export type VeredictoFatura = { status: StatusVeredito; divergencias: Divergencia[] };

export type PrevisaoConferencia = {
  grossAmount: number | null; // bruto esperado (valor_total do contrato)
  currency: string | null; // moeda do contrato
  estudanteNome: string | null;
};

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

// Confere a fatura contra a previsao. Puro e defensivo.
export function conferirFatura(input: {
  fatura: FaturaExtraida;
  previsao: PrevisaoConferencia;
  toleranciaValorPct?: number;
}): VeredictoFatura {
  const { fatura, previsao } = input;
  const tol = typeof input.toleranciaValorPct === "number" && input.toleranciaValorPct >= 0 ? input.toleranciaValorPct : TOLERANCIA_VALOR_PCT;
  const divergencias: Divergencia[] = [];
  // Comparadores essenciais que NAO deram para verificar (viram 'indeterminado'
  // se nao houver divergencia critica — "nao verificado" nunca e "conferido").
  const naoVerificado: Divergencia[] = [];

  // MOEDA: ambas presentes e diferentes -> critica; fatura sem moeda -> nao verificado.
  const moedaFatura = fatura.currency ? fatura.currency.toUpperCase() : null;
  const moedaPrev = previsao.currency ? previsao.currency.toUpperCase() : null;
  if (moedaFatura && moedaPrev && moedaFatura !== moedaPrev) {
    divergencias.push({ campo: "Moeda", fatura: moedaFatura, esperado: moedaPrev, severidade: "critica" });
  } else if (!moedaFatura) {
    naoVerificado.push({ campo: "Moeda", fatura: "não extraída", esperado: moedaPrev ?? "—", severidade: "informativa" });
  }

  // VALOR: fatura sem valor OU divergencia acima da tolerancia -> critica;
  // previsao sem valor esperado -> nao verificado (nao da para comparar).
  if (fatura.grossAmount == null) {
    divergencias.push({ campo: "Valor bruto", fatura: "não extraído", esperado: fmt(previsao.grossAmount), severidade: "critica" });
  } else if (previsao.grossAmount != null && previsao.grossAmount > 0) {
    const diff = Math.abs(fatura.grossAmount - previsao.grossAmount);
    if (diff / previsao.grossAmount > tol) {
      divergencias.push({ campo: "Valor bruto", fatura: fmt(fatura.grossAmount), esperado: fmt(previsao.grossAmount), severidade: "critica" });
    }
  } else {
    naoVerificado.push({ campo: "Valor bruto", fatura: fmt(fatura.grossAmount), esperado: "sem valor no contrato", severidade: "informativa" });
  }

  // ESTUDANTE: ambos presentes e similaridade baixa -> critica; algum lado
  // ausente -> nao verificado.
  if (fatura.studentName && previsao.estudanteNome) {
    if (similaridadeNome(fatura.studentName, previsao.estudanteNome) < MIN_SIMILARIDADE_NOME) {
      divergencias.push({ campo: "Estudante", fatura: fatura.studentName, esperado: previsao.estudanteNome, severidade: "critica" });
    }
  } else {
    naoVerificado.push({ campo: "Estudante", fatura: fatura.studentName ?? "não extraído", esperado: previsao.estudanteNome ?? "—", severidade: "informativa" });
  }

  const temCritica = divergencias.some((d) => d.severidade === "critica");
  if (temCritica) return { status: "divergente", divergencias };
  // Sem critica, mas faltou verificar algo essencial -> indeterminado (amarelo).
  if (naoVerificado.length > 0) return { status: "indeterminado", divergencias: naoVerificado };
  return { status: "conferida", divergencias: [] };
}

function fmt(v: number | null): string {
  return v == null ? "—" : v.toFixed(2);
}
