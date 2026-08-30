// Motor PURO dos encargos de mora (Clausula 13): apos a data-limite de quitacao
// (D-30 do inicio), o SALDO devedor remanescente passa a acumular MULTA (unica),
// JUROS (ao mes, pro-rata por dia) e, se houver, INDICE de correcao monetaria.
// Alem disso, os GATILHOS de escalada: 15 dias -> suspensao; 30 dias -> resolucao.
// Produz a MEMORIA DE CALCULO para a Area do Cliente e o admin.
//
// SEM imports: roda no runner nativo do Node. Puro e deterministico. Nao decide
// nem grava dinheiro; apenas calcula e itemiza.
//
// [colchetes] — os PERCENTUAIS (multa 2%, juros 1%/mes), o INDICE (IPCA/IGP-M) e
// os prazos (15/30) sao decisoes do juridico/financeiro. Config por instancia
// (defaults abaixo, a confirmar); nunca cravados na regra.

export const MORA_MULTA_PADRAO = 0.02; // 2% (multa unica sobre o saldo)
export const MORA_JUROS_MES_PADRAO = 0.01; // 1% ao mes (pro-rata por dia)
export const MORA_INDICE_PADRAO = 0; // correcao monetaria — [colchetes], 0 ate definir a fonte/indice
export const MORA_SUSPENSAO_DIAS = 15; // 15 dias de atraso -> suspensao
export const MORA_RESOLUCAO_DIAS = 30; // 30 dias de atraso -> resolucao

export type EstagioMora = "em_dia" | "mora" | "suspensao" | "resolucao";
export type LinhaMemoria = { rotulo: string; valor: number; tipo: "moeda" | "pct" };

export function estagioMora(
  diasAtraso: number,
  cfg?: { suspensaoDias?: number; resolucaoDias?: number },
): EstagioMora {
  const susp = cfg?.suspensaoDias ?? MORA_SUSPENSAO_DIAS;
  const reso = cfg?.resolucaoDias ?? MORA_RESOLUCAO_DIAS;
  if (diasAtraso <= 0) return "em_dia";
  if (diasAtraso >= reso) return "resolucao";
  if (diasAtraso >= susp) return "suspensao";
  return "mora";
}

export type MoraInput = {
  saldoMoeda: number; // saldo devedor remanescente na moeda
  diasAtraso: number; // dias apos a data-limite de quitacao (<=0 = em dia)
  multaPercent?: number; // default MORA_MULTA_PADRAO
  jurosMesPercent?: number; // default MORA_JUROS_MES_PADRAO
  indicePercent?: number; // default MORA_INDICE_PADRAO
  suspensaoDias?: number;
  resolucaoDias?: number;
};

export type MoraResultado = {
  aplicavel: boolean; // atraso > 0 e saldo > 0
  diasAtraso: number;
  saldoMoeda: number;
  multaPercent: number;
  multa: number; // saldo x multaPercent (uma vez)
  jurosMesPercent: number;
  juros: number; // saldo x jurosMes x (diasAtraso/30) — pro-rata diaria
  indicePercent: number;
  indice: number; // saldo x indicePercent
  encargos: number; // multa + juros + indice
  saldoComEncargos: number; // saldo + encargos
  estagio: EstagioMora;
  memoria: LinhaMemoria[];
};

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}
function naoNeg(n: number): number {
  return n > 0 ? n : 0;
}

export function calcularMoraSaldo(input: MoraInput): MoraResultado {
  const saldo = naoNeg(round2(input.saldoMoeda));
  const diasAtraso = Math.trunc(Number(input.diasAtraso) || 0);
  const multaPercent = input.multaPercent ?? MORA_MULTA_PADRAO;
  const jurosMesPercent = input.jurosMesPercent ?? MORA_JUROS_MES_PADRAO;
  const indicePercent = input.indicePercent ?? MORA_INDICE_PADRAO;
  const estagio = estagioMora(diasAtraso, { suspensaoDias: input.suspensaoDias, resolucaoDias: input.resolucaoDias });

  const aplicavel = diasAtraso > 0 && saldo > 0;

  const multa = aplicavel ? round2(saldo * multaPercent) : 0;
  // Juros ao mes pro-rata por dia (base 30). Ex.: 1%/mes por 45 dias = 1,5%.
  const juros = aplicavel ? round2(saldo * jurosMesPercent * (diasAtraso / 30)) : 0;
  const indice = aplicavel ? round2(saldo * indicePercent) : 0;
  const encargos = round2(multa + juros + indice);
  const saldoComEncargos = round2(saldo + encargos);

  const memoria: LinhaMemoria[] = [{ rotulo: "Saldo devedor", valor: saldo, tipo: "moeda" }];
  if (aplicavel) {
    memoria.push({ rotulo: `Multa (${pctTxt(multaPercent)})`, valor: multa, tipo: "moeda" });
    memoria.push({ rotulo: `Juros de mora (${pctTxt(jurosMesPercent)}/mês · ${diasAtraso} dias)`, valor: juros, tipo: "moeda" });
    if (indice > 0) memoria.push({ rotulo: `Correção monetária (${pctTxt(indicePercent)})`, valor: indice, tipo: "moeda" });
    memoria.push({ rotulo: "Total de encargos", valor: encargos, tipo: "moeda" });
    memoria.push({ rotulo: "Saldo com encargos", valor: saldoComEncargos, tipo: "moeda" });
  }

  return {
    aplicavel,
    diasAtraso,
    saldoMoeda: saldo,
    multaPercent,
    multa,
    jurosMesPercent,
    juros,
    indicePercent,
    indice,
    encargos,
    saldoComEncargos,
    estagio,
    memoria,
  };
}

function pctTxt(fracao: number): string {
  const v = Math.round(fracao * 100 * 1000) / 1000;
  return String(v).replace(".", ",") + "%";
}
