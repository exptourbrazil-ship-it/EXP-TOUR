// Motor PURO da Política de Retenção do FORNECEDOR/CAMPUS em ESCADA (spec 2:
// "Anexo III, datas e cálculo de reembolso"). Distinta da retenção da EXP Tour
// (Anexo I, reembolso-anexo-i.ts): esta é a retenção da ESCOLA em caso de
// cancelamento, que cresce em DEGRAUS conforme a proximidade da âncora (início do
// curso ou chegada da acomodação) — quanto mais perto/dentro, mais se retém.
//
// Dimensões (todas CONFIG por campus, nunca cravadas):
//   - âncora: início do curso OU chegada da acomodação (podem coexistir — o
//     serviço avalia as duas políticas e a calculadora unificada pega a pior);
//   - unidade da métrica: dias corridos, dias úteis, semanas, ou % de horas;
//   - degraus: faixas por métrica RESTANTE (mais restante = mais distante = menor
//     retenção), cada uma com % do valor-base ou valor fixo;
//   - teto (cap) e mínimo (piso) do valor retido, na moeda da política.
//
// SEM imports (roda no runner nativo do Node). Puro/determinístico. Não decide
// dinheiro nem grava — calcula e itemiza. A COMBINAÇÃO com o degrau de ESTADO
// (Anexo I) e com o câmbio é da calculadora unificada (fatia seguinte).

export type AncoraRetencao = "inicio_curso" | "chegada_acomodacao";
export type UnidadeRetencao = "dias_corridos" | "dias_uteis" | "semanas" | "percent_horas";

export type DegrauRetencao = {
  // Limite superior da MÉTRICA RESTANTE para este degrau valer (ex.: ate=30 =>
  // "faltando até 30 unidades para a âncora"). null = sem limite (degrau mais
  // distante, tipicamente 0% de retenção).
  ate: number | null;
  retencaoPercentual?: number; // 0..1 do valor-base
  retencaoValor?: number; // valor fixo na moeda da política (alternativa ao %)
  rotulo?: string;
};

export type PoliticaRetencao = {
  ancora: AncoraRetencao;
  unidade: UnidadeRetencao;
  degraus: DegrauRetencao[];
  moeda: string;
  teto?: number | null; // cap do valor retido
  minimo?: number | null; // piso do valor retido
};

export type LinhaMemoria = { rotulo: string; valor: number; tipo: "moeda" | "pct" | "num" };

export type RetencaoCampusResultado = {
  moeda: string;
  unidade: UnidadeRetencao;
  metrica: number | null; // métrica restante (na unidade); null = não aplicável
  degrau: DegrauRetencao | null;
  base: number;
  retencaoPercentual: number; // 0..1 (0 quando o degrau é valor fixo)
  retencaoBruta: number; // antes de teto/mínimo
  tetoAtingido: boolean;
  minimoAplicado: boolean;
  totalRetido: number; // após teto/mínimo
  memoria: LinhaMemoria[];
};

const MS_DIA = 24 * 60 * 60 * 1000;

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}
function naoNeg(n: number): number {
  return n > 0 ? n : 0;
}
function utcDeISO(iso: string): number {
  const [ano, mes, dia] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(ano, mes - 1, dia);
}
function isoDeUTC(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}
// Mesma definição de dia útil de src/lib/dias-uteis.ts (inline: o motor puro não
// pode importar em runtime sob node --test). Fim de semana + conjunto de feriados.
function ehDiaUtilInline(iso: string, feriados?: Set<string>): boolean {
  const d = new Date(utcDeISO(iso)).getUTCDay();
  if (d === 0 || d === 6) return false;
  if (feriados && feriados.has(iso.slice(0, 10))) return false;
  return true;
}

// Métrica RESTANTE até a âncora, na unidade da política. Cancelamento na âncora ou
// depois => 0 (dentro/passou => degrau mais alto). percent_horas usa horas, não
// datas: retorna o % de horas RESTANTES (100 - cumpridas/totais). null quando não
// há dados para computar (mantém a unidade uniforme: sempre "restante").
export function metricaRestante(
  unidade: UnidadeRetencao,
  p: {
    ancoraISO?: string | null;
    cancelamentoISO?: string | null;
    feriados?: Set<string>;
    horasCumpridas?: number | null;
    horasTotais?: number | null;
  },
): number | null {
  if (unidade === "percent_horas") {
    const tot = Number(p.horasTotais);
    if (!Number.isFinite(tot) || tot <= 0) return null;
    const cum = naoNeg(Number(p.horasCumpridas) || 0);
    const restantePct = 100 * (1 - Math.min(cum, tot) / tot);
    return Math.round(restantePct);
  }

  if (!p.ancoraISO || !p.cancelamentoISO) return null;
  const ancora = utcDeISO(p.ancoraISO);
  const cancel = utcDeISO(p.cancelamentoISO);
  if (!Number.isFinite(ancora) || !Number.isFinite(cancel)) return null;
  if (cancel >= ancora) return 0; // já dentro/depois da âncora

  if (unidade === "dias_corridos") {
    return Math.floor((ancora - cancel) / MS_DIA);
  }
  if (unidade === "semanas") {
    return Math.floor((ancora - cancel) / MS_DIA / 7);
  }
  // dias_uteis: conta os dias úteis que ainda faltam — intervalo (cancelamento, âncora].
  let total = 0;
  for (let ms = cancel + MS_DIA; ms <= ancora; ms += MS_DIA) {
    if (ehDiaUtilInline(isoDeUTC(ms), p.feriados)) total += 1;
  }
  return total;
}

// Seleciona o degrau para uma métrica: o de MENOR `ate` que ainda comporta a
// métrica (metrica <= ate). `ate: null` é o teto do último degrau (mais distante).
export function selecionarDegrau(degraus: DegrauRetencao[], metrica: number | null): DegrauRetencao | null {
  if (metrica == null || !degraus || degraus.length === 0) return null;
  const ordenados = [...degraus].sort((a, b) => {
    const av = a.ate == null ? Infinity : a.ate;
    const bv = b.ate == null ? Infinity : b.ate;
    return av - bv;
  });
  for (const d of ordenados) {
    const limite = d.ate == null ? Infinity : d.ate;
    if (metrica <= limite) return d;
  }
  return ordenados[ordenados.length - 1] ?? null;
}

const ROTULO_UNIDADE: Record<UnidadeRetencao, string> = {
  dias_corridos: "dias corridos",
  dias_uteis: "dias úteis",
  semanas: "semanas",
  percent_horas: "% de horas restantes",
};

export function calcularRetencaoCampus(
  politica: PoliticaRetencao,
  ctx: { base: number; metricaRestante: number | null },
): RetencaoCampusResultado {
  const moeda = politica.moeda || "BRL";
  const unidade = politica.unidade;
  const base = naoNeg(round2(ctx.base));
  const metrica = ctx.metricaRestante;
  const degrau = selecionarDegrau(politica.degraus, metrica);

  const retencaoPercentual = degrau?.retencaoPercentual != null ? degrau.retencaoPercentual : 0;
  const retencaoValorFixo = degrau?.retencaoValor != null ? round2(degrau.retencaoValor) : null;
  const retencaoBruta = retencaoValorFixo != null ? naoNeg(retencaoValorFixo) : round2(base * retencaoPercentual);

  // Piso (mínimo) e teto (cap) sobre o valor retido, nesta ordem.
  let totalRetido = retencaoBruta;
  let minimoAplicado = false;
  if (politica.minimo != null && totalRetido < politica.minimo) {
    totalRetido = round2(politica.minimo);
    minimoAplicado = true;
  }
  let tetoAtingido = false;
  if (politica.teto != null && totalRetido > politica.teto) {
    totalRetido = round2(politica.teto);
    tetoAtingido = true;
  }
  totalRetido = round2(naoNeg(totalRetido));

  const memoria: LinhaMemoria[] = [];
  memoria.push({ rotulo: "Base de cálculo (retenção do fornecedor)", valor: base, tipo: "moeda" });
  if (metrica != null) {
    memoria.push({ rotulo: `Faltam para a âncora (${ROTULO_UNIDADE[unidade]})`, valor: metrica, tipo: "num" });
  }
  if (degrau) {
    if (retencaoValorFixo != null) {
      memoria.push({ rotulo: `Degrau${degrau.rotulo ? " — " + degrau.rotulo : ""} (valor fixo)`, valor: retencaoBruta, tipo: "moeda" });
    } else {
      memoria.push({ rotulo: `Degrau${degrau.rotulo ? " — " + degrau.rotulo : ""}`, valor: retencaoPercentual, tipo: "pct" });
      memoria.push({ rotulo: "Retenção do fornecedor", valor: retencaoBruta, tipo: "moeda" });
    }
  } else {
    memoria.push({ rotulo: "Sem degrau aplicável (sem retenção)", valor: 0, tipo: "moeda" });
  }
  if (minimoAplicado) memoria.push({ rotulo: `Ajustado ao mínimo (${moeda} ${politica.minimo})`, valor: totalRetido, tipo: "moeda" });
  if (tetoAtingido) memoria.push({ rotulo: `Limitado ao teto (${moeda} ${politica.teto})`, valor: totalRetido, tipo: "moeda" });
  memoria.push({ rotulo: "Total retido pelo fornecedor", valor: totalRetido, tipo: "moeda" });

  return {
    moeda,
    unidade,
    metrica,
    degrau,
    base,
    retencaoPercentual: retencaoValorFixo != null ? 0 : retencaoPercentual,
    retencaoBruta,
    tetoAtingido,
    minimoAplicado,
    totalRetido,
    memoria,
  };
}
