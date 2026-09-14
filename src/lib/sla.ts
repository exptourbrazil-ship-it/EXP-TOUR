// Motor PURO de SLA (prazos de atendimento) em DIAS ÚTEIS. A Fila do Dia já tem
// um SLA por tipo de exceção (excecao.ts: slaDias), mas o envelhecimento é hoje
// em dias CORRIDOS; este motor calcula o PRAZO e o STATUS contando só dias úteis
// (fim de semana + feriados) — como o contrato promete ("até 2 dias úteis").
//
// SEM imports (nem "@/..." nem extensão): roda direto no runner nativo do Node
// (node --test, type-stripping). Self-contained: a aritmética de dias úteis é
// reimplementada aqui (espelha dias-uteis.ts) para o motor ficar puro e testável
// sem cross-import — mesmo padrão de politica-retencao.ts.
//
// Convenções: datas ISO YYYY-MM-DD, aritmética em UTC (independe do fuso do
// servidor); "dia útil" = não é sábado/domingo e não está no conjunto de feriados.

export type Feriados = Set<string>;

// Situação de um prazo em relação ao "agora".
export type StatusSLA = "no_prazo" | "vence_hoje" | "vencido";

export type AvaliacaoSLA = {
  prazoISO: string; // data limite (YYYY-MM-DD): abertura + slaDias dias ÚTEIS
  diasUteisRestantes: number; // úteis até o prazo; 0 = vence hoje; negativo = atraso
  atrasoDiasUteis: number; // úteis já vencidos além do prazo (0 se no prazo/hoje)
  status: StatusSLA;
};

const MS_DIA = 24 * 60 * 60 * 1000;

function utcDeISO(iso: string): number {
  const [ano, mes, dia] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(ano, mes - 1, dia);
}

function isoDeUTC(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function ehFimDeSemana(iso: string): boolean {
  const d = new Date(utcDeISO(iso)).getUTCDay();
  return d === 0 || d === 6;
}

function ehDiaUtil(iso: string, feriados?: Feriados): boolean {
  if (!iso || iso.length < 10) return false;
  if (ehFimDeSemana(iso)) return false;
  if (feriados && feriados.has(iso.slice(0, 10))) return false;
  return true;
}

// Soma n dias ÚTEIS a partir da data (n>=0). n=0 retorna a própria data.
function somarDiasUteis(iso: string, n: number, feriados?: Feriados): string {
  if (!Number.isFinite(n) || n <= 0) return iso.slice(0, 10);
  let restantes = Math.trunc(n);
  let ms = utcDeISO(iso);
  while (restantes > 0) {
    ms += MS_DIA;
    if (ehDiaUtil(isoDeUTC(ms), feriados)) restantes -= 1;
  }
  return isoDeUTC(ms);
}

// Conta dias ÚTEIS no intervalo INCLUSIVO [deISO, ateISO]. ate < de => 0.
function contarDiasUteis(deISO: string, ateISO: string, feriados?: Feriados): number {
  const de = utcDeISO(deISO);
  const ate = utcDeISO(ateISO);
  if (!Number.isFinite(de) || !Number.isFinite(ate) || ate < de) return 0;
  let total = 0;
  for (let ms = de; ms <= ate; ms += MS_DIA) {
    if (ehDiaUtil(isoDeUTC(ms), feriados)) total += 1;
  }
  return total;
}

// Prazo (data limite) de um SLA: `slaDias` dias ÚTEIS após a abertura. Um SLA de
// 0 dias vence no próprio dia da abertura (normalizado para YYYY-MM-DD).
export function calcularPrazoSLA(aberturaISO: string, slaDias: number, feriados?: Feriados): string {
  return somarDiasUteis(aberturaISO, Math.max(0, Math.trunc(slaDias || 0)), feriados);
}

// Avalia um SLA contra o "agora". diasUteisRestantes = úteis entre hoje e o
// prazo (0 no dia do prazo, positivo antes, negativo depois). O status deriva do
// sinal. Comparação por DATA (não por hora) — SLA em dias úteis é diário.
export function avaliarSLA(
  aberturaISO: string,
  slaDias: number,
  agoraISO: string,
  feriados?: Feriados,
): AvaliacaoSLA {
  const prazoISO = calcularPrazoSLA(aberturaISO, slaDias, feriados);
  const hoje = (agoraISO || "").slice(0, 10);
  const prazoMs = utcDeISO(prazoISO);
  const hojeMs = utcDeISO(hoje);

  let diasUteisRestantes: number;
  if (hojeMs <= prazoMs) {
    // Úteis de hoje até o prazo (inclusivo) menos o próprio prazo => "faltam N".
    diasUteisRestantes = contarDiasUteis(hoje, prazoISO, feriados) - 1;
  } else {
    // Atraso: úteis do prazo até hoje (inclusivo) menos o próprio prazo.
    diasUteisRestantes = -(contarDiasUteis(prazoISO, hoje, feriados) - 1);
  }

  // Status é por DATA: hoje antes do prazo = no prazo; no dia = vence hoje;
  // depois = vencido — mesmo que nenhum dia ÚTIL tenha passado ainda (ex.: sábado
  // logo após um prazo na sexta já é "vencido", com atraso de 0 dias úteis).
  const status: StatusSLA =
    hojeMs < prazoMs ? "no_prazo" : hojeMs === prazoMs ? "vence_hoje" : "vencido";
  const atrasoDiasUteis = diasUteisRestantes < 0 ? -diasUteisRestantes : 0;

  return { prazoISO, diasUteisRestantes, atrasoDiasUteis, status };
}

// Rank para ORDENAR por urgência (menor = mais urgente): vencidos primeiro (mais
// atrasados no topo), depois os que vencem hoje, depois por dias restantes.
export function rankUrgenciaSLA(a: AvaliacaoSLA): number {
  if (a.status === "vencido") return -1000 - a.atrasoDiasUteis; // mais atraso = mais no topo
  if (a.status === "vence_hoje") return 0;
  return a.diasUteisRestantes; // no prazo: quanto menos falta, mais no topo
}

export const ROTULO_STATUS_SLA: Record<StatusSLA, string> = {
  no_prazo: "No prazo",
  vence_hoje: "Vence hoje",
  vencido: "SLA estourado",
};
