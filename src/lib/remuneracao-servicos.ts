// Motor PURO da Remuneração por Serviços Prestados (Contrato v3.1, item I.2 +
// forio-especificacao-anexo3-sistema §5 / forio-arquitetura-operacao §2.1).
//
// Distinta da retenção do FORNECEDOR (politica-retencao.ts): esta é a
// remuneração da FORIO em caso de cancelamento após o arrependimento. Duas
// diferenças-chave em relação ao motor legado (reembolso-anexo-i.ts):
//   1) a BASE é o COMPONENTE EDUCACIONAL (Cláusula 1.1.g.1), não o Custo do
//      Programa nem o tuition — nunca inclui passagem/seguro (item I.2.8);
//   2) o degrau é o MAIOR entre o derivado do ESTADO do processo e o derivado da
//      DATA: "programa a menos de 30 dias do início força 5%", qualquer que seja
//      o estado. A memória registra QUAL dos dois determinou (§2.1).
// Teto absoluto de 800 na moeda de referência (item I.2.1), sem conversão.
//
// SEM imports (roda no runner nativo do Node). Puro/determinístico. Não decide
// dinheiro nem grava — calcula e itemiza. Percentuais/teto são CONFIG por tenant
// (defaults abaixo, a confirmar pelo jurídico/financeiro).

export const ESTADOS_PROCESSO = ["nao_submetida", "submetida", "loa", "visto"] as const;
export type EstadoProcesso = (typeof ESTADOS_PROCESSO)[number];

// Percentual sobre o Componente Educacional por ESTADO concluído (§5):
//  - nao_submetida: 0% (salvo atraso imputável ao Contratante => 2%);
//  - submetida (matrícula submetida e processada): 2%;
//  - loa (carta de aceitação emitida): 3,5%;
//  - visto (pedido de visto instruído): 5%.
export const PCT_POR_ESTADO: Record<EstadoProcesso, number> = {
  nao_submetida: 0,
  submetida: 0.02,
  loa: 0.035,
  visto: 0.05,
};

// Programa a menos de 30 dias do início força este degrau, qualquer que seja o
// estado (§2.1 / §5 "sobreposição").
export const PCT_MENOS_30_DIAS = 0.05;
export const DIAS_LIMITE_FORCA_MAX = 30;

// Teto absoluto da Remuneração, na MOEDA DE REFERÊNCIA (item I.2.1). Config.
export const TETO_REMUNERACAO = 800;

const ROTULO_ESTADO: Record<EstadoProcesso, string> = {
  nao_submetida: "Matrícula ainda não submetida",
  submetida: "Matrícula submetida e processada",
  loa: "Carta de aceitação emitida",
  visto: "Pedido de visto instruído",
};

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}
function naoNeg(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 0;
}
function ehEstado(v: unknown): v is EstadoProcesso {
  return typeof v === "string" && (ESTADOS_PROCESSO as readonly string[]).includes(v);
}

export type DegrauRemuneracao = {
  percentual: number;
  origem: "estado" | "data"; // qual regra determinou o degrau (empate => "estado")
  estado: EstadoProcesso;
  rotuloEstado: string;
  forcadoPorData: boolean; // true quando "<30 dias" elevou o degrau
};

// Resolve o degrau da Remuneração: MAX(percentual do estado, percentual da data).
// `diasAteInicio` null = data desconhecida (não força). `atrasoImputavel` eleva o
// piso do estado nao_submetida para 2% (§5).
export function resolverDegrauRemuneracao(input: {
  estado: unknown;
  diasAteInicio: number | null;
  atrasoImputavel?: boolean;
}): DegrauRemuneracao {
  const estado: EstadoProcesso = ehEstado(input.estado) ? input.estado : "nao_submetida";
  let pctEstado = PCT_POR_ESTADO[estado];
  if (estado === "nao_submetida" && input.atrasoImputavel) pctEstado = 0.02;

  const dias = input.diasAteInicio;
  const forcaData = typeof dias === "number" && Number.isFinite(dias) && dias < DIAS_LIMITE_FORCA_MAX;
  const pctData = forcaData ? PCT_MENOS_30_DIAS : 0;

  const percentual = Math.max(pctEstado, pctData);
  // Origem: "data" só quando a data ELEVOU acima do estado.
  const origem: "estado" | "data" = forcaData && pctData > pctEstado ? "data" : "estado";
  return {
    percentual,
    origem,
    estado,
    rotuloEstado: ROTULO_ESTADO[estado],
    forcadoPorData: origem === "data",
  };
}

// Sinais que derivam o ESTADO do processo v3.1 (forio-arquitetura-operacao §2,
// estados 11/12/13). Distinto da EtapaChave do Anexo I legado (etapa-anexo-i.ts):
// aqui o 2% é a MATRÍCULA SUBMETIDA ao Fornecedor (estado 11), NÃO a entrada paga
// — a entrada precede a submissão, e reter 2% antes de submeter superestimaria a
// Remuneração. Não há degrau de "assinatura 1%": antes de submeter é 0% (salvo
// atraso imputável, tratado no cálculo do degrau).
export type SinaisEstadoProcesso = {
  matriculaSubmetida?: boolean; // estado 11: submetida e processada ao Fornecedor
  temLOA?: boolean; // estado 12: carta de aceitação (LOA) emitida
  vistoInstruido?: boolean; // estado 13: pedido de visto instruído
};

// Deriva o EstadoProcesso do maior marco atingido (monotônico: visto > loa >
// submetida > nao_submetida). Puro; consome sinais já disponíveis no serviço
// (documentos carta_aceite; contratos.visto_status) + o marco de submissão.
export function derivarEstadoProcesso(s: SinaisEstadoProcesso): EstadoProcesso {
  if (s.vistoInstruido) return "visto";
  if (s.temLOA) return "loa";
  if (s.matriculaSubmetida) return "submetida";
  return "nao_submetida";
}

export type LinhaMemoria = { rotulo: string; valor: number; tipo: "moeda" | "pct" | "num" };

export type RemuneracaoResultado = {
  moeda: string;
  degrau: DegrauRemuneracao;
  base: number; // Componente Educacional
  bruto: number; // percentual × base (antes do teto)
  teto: number;
  tetoAtingido: boolean;
  valor: number; // min(bruto, teto) — a Remuneração devida
  memoria: LinhaMemoria[];
};

export function calcularRemuneracaoServicos(input: {
  moeda?: string;
  componenteEducacional: number;
  estado: unknown;
  diasAteInicio: number | null;
  atrasoImputavel?: boolean;
  teto?: number;
}): RemuneracaoResultado {
  const moeda = (input.moeda || "BRL").toUpperCase();
  const base = naoNeg(round2(input.componenteEducacional));
  const teto = input.teto != null ? naoNeg(round2(input.teto)) : TETO_REMUNERACAO;
  const degrau = resolverDegrauRemuneracao(input);

  const bruto = round2(base * degrau.percentual);
  const tetoAtingido = bruto > teto;
  const valor = round2(Math.min(bruto, teto));

  const memoria: LinhaMemoria[] = [];
  memoria.push({ rotulo: "Base — Componente Educacional", valor: base, tipo: "moeda" });
  memoria.push({
    rotulo:
      degrau.origem === "data"
        ? `Degrau forçado pela data (menos de ${DIAS_LIMITE_FORCA_MAX} dias do início)`
        : `Degrau do estado — ${degrau.rotuloEstado}`,
    valor: degrau.percentual,
    tipo: "pct",
  });
  memoria.push({ rotulo: "Remuneração por serviços prestados", valor: bruto, tipo: "moeda" });
  if (tetoAtingido) memoria.push({ rotulo: `Limitada ao teto (${moeda} ${teto})`, valor: valor, tipo: "moeda" });
  memoria.push({ rotulo: "Total da Remuneração", valor: valor, tipo: "moeda" });

  return { moeda, degrau, base, bruto, teto, tetoAtingido, valor, memoria };
}
