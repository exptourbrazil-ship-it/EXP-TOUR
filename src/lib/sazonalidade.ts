// Interpretacao PURA dos periodos de temporada como as escolas publicam ("14/jun a
// 23/ago", "26/jun a 30/ago/2026", "3/jan a 28/fev e 1/nov a 31/dez"). Usado pela
// carga de catalogo e pela leitura de price list por IA: o texto do fornecedor vira
// intervalos estruturados que o motor de preco sabe aplicar.
//
// Sem ano  = periodo RECORRENTE (vale todo ano, como as escolas publicam).
// Com ano  = vale so naquele ano.
// NAO interpreta frases que negam o periodo ("nao se aplica", "sob consulta",
// "fora de X (preco base)"): devolve lista vazia com o motivo, para o operador ver.

export type PeriodoPonto = { month: number; day: number; year?: number };
export type IntervaloSazonal = { from: PeriodoPonto; to: PeriodoPonto };

export type LeituraPeriodo = {
  intervalos: IntervaloSazonal[];
  /** Por que nada foi extraido (texto vazio, negacao, formato nao reconhecido). */
  motivo?: string;
};

const MESES: Record<string, number> = {
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6,
  jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
  // Ingles: price lists costumam vir no idioma da escola.
  feb: 2, apr: 4, may: 5, aug: 8, sep: 9, oct: 10, dec: 12,
};

const DIAS_NO_MES = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

// Frases que NEGAM o periodo. "fora de X" e "preco base" descrevem o que NAO tem
// ajuste — interpretar o X ali criaria um desconto que a escola nao publicou.
const NEGACOES = [
  "nao se aplica", "não se aplica",
  "nao publicado", "não publicado",
  "sob consulta",
  "nao ha", "não há",
  "sem suplemento",
  "fora de",
  "preco base", "preço base",
  // Excecao dentro do periodo: "1/jun a 31/ago, exceto 10/jul a 20/jul" tem 4
  // datas e viraria DOIS periodos cobraveis. Melhor recusar e mandar revisar.
  "exceto", "except", "salvo",
];

function semAcento(t: string): string {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Ponto valido? (mes 1-12, dia dentro do mes, ano com 4 digitos quando presente) */
function pontoValido(p: PeriodoPonto): boolean {
  if (!Number.isInteger(p.month) || p.month < 1 || p.month > 12) return false;
  if (!Number.isInteger(p.day) || p.day < 1 || p.day > DIAS_NO_MES[p.month - 1]) return false;
  if (p.year !== undefined && (!Number.isInteger(p.year) || p.year < 2000 || p.year > 2100)) return false;
  return true;
}

// "14/jun", "30/ago/2026", "1/nov"
const RE_DATA = /(\d{1,2})\s*\/\s*([a-zç]{3,9})\.?(?:\s*\/\s*(\d{4}))?/gi;

/**
 * Le o texto do fornecedor e devolve os intervalos. Aceita varios intervalos
 * separados por " e " / ";" / ",". Um intervalo = um par de datas em sequencia.
 */
export function interpretarPeriodoSazonal(texto: string | null | undefined): LeituraPeriodo {
  const cru = (texto ?? "").trim();
  if (!cru) return { intervalos: [], motivo: "sem período informado" };

  const plano = semAcento(cru);
  const negacao = NEGACOES.map(semAcento).find((n) => plano.includes(n));
  if (negacao) return { intervalos: [], motivo: `texto nega o período ("${cru.slice(0, 60)}")` };

  const datas: PeriodoPonto[] = [];
  for (const m of cru.matchAll(RE_DATA)) {
    const mes = MESES[semAcento(m[2]).slice(0, 3)];
    if (mes === undefined) continue;
    const ponto: PeriodoPonto = { month: mes, day: Number(m[1]) };
    if (m[3]) ponto.year = Number(m[3]);
    if (!pontoValido(ponto)) return { intervalos: [], motivo: `data inválida em "${cru.slice(0, 60)}"` };
    datas.push(ponto);
  }

  if (datas.length === 0) return { intervalos: [], motivo: `nenhuma data reconhecida em "${cru.slice(0, 60)}"` };
  if (datas.length % 2 !== 0) {
    return { intervalos: [], motivo: `número ímpar de datas em "${cru.slice(0, 60)}" — revise manualmente` };
  }

  const intervalos: IntervaloSazonal[] = [];
  for (let i = 0; i < datas.length; i += 2) {
    intervalos.push({ from: datas[i], to: datas[i + 1] });
  }

  // Par invertido ("23/ago a 14/jun") seria lido como periodo que cruza o ano e
  // viraria uma "alta temporada" de dez meses. Recusa: quase sempre e erro de
  // digitacao, e o prejuizo de cobrar o ano inteiro e grande.
  const diaDoAno = (p: PeriodoPonto) => p.month * 31 + p.day;
  for (const iv of intervalos) {
    if (iv.from.year == null && iv.to.year == null && diaDoAno(iv.to) < diaDoAno(iv.from)) {
      const meses = (12 * 31 - diaDoAno(iv.from) + diaDoAno(iv.to)) / 31;
      if (meses > 6) {
        return { intervalos: [], motivo: `período invertido ou longo demais em "${cru.slice(0, 60)}" — revise manualmente` };
      }
    }
  }
  return { intervalos };
}

/** Texto curto do intervalo para a linha da cotação ("14/jun a 23/ago"). */
export function descreverIntervalo(iv: IntervaloSazonal): string {
  const nome = (p: PeriodoPonto) => {
    const mes = Object.keys(MESES).find((k) => MESES[k] === p.month && k.length === 3) ?? String(p.month);
    return `${p.day}/${mes}${p.year ? `/${p.year}` : ""}`;
  };
  return `${nome(iv.from)} a ${nome(iv.to)}`;
}
