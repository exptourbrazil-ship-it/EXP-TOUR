// Motor PURO de dias úteis (calendário de negócios). Base para prazos contados em
// dias ÚTEIS (não corridos) — retenção por fornecedor, SLAs, reembolso (P2). Hoje
// o portal conta tudo em dias corridos; este motor introduz fim de semana +
// feriados.
//
// SEM imports (nem "@/..." nem extensão): roda direto no runner nativo do Node
// (node --test, type-stripping). Puro e determinístico.
//
// Convenções:
//  - datas são strings ISO YYYY-MM-DD; toda a aritmética é em UTC (calendário),
//    para não depender do fuso do servidor;
//  - "dia útil" = não é sábado/domingo E não está no conjunto de feriados;
//  - feriados: conjunto (Set) de YYYY-MM-DD. Vazio/omitido => só fim de semana.

export type Feriados = Set<string>;

const MS_DIA = 24 * 60 * 60 * 1000;

function utcDeISO(iso: string): number {
  const [ano, mes, dia] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(ano, mes - 1, dia);
}

function isoDeUTC(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

// 0 = domingo ... 6 = sábado (getUTCDay).
export function ehFimDeSemana(iso: string): boolean {
  const d = new Date(utcDeISO(iso)).getUTCDay();
  return d === 0 || d === 6;
}

export function ehDiaUtil(iso: string, feriados?: Feriados): boolean {
  if (!iso || iso.length < 10) return false;
  if (ehFimDeSemana(iso)) return false;
  if (feriados && feriados.has(iso.slice(0, 10))) return false;
  return true;
}

// Próximo dia ÚTIL >= a data (o próprio, se já for útil).
export function proximoDiaUtil(iso: string, feriados?: Feriados): string {
  let ms = utcDeISO(iso);
  while (!ehDiaUtil(isoDeUTC(ms), feriados)) ms += MS_DIA;
  return isoDeUTC(ms);
}

// Dia útil anterior <= a data (o próprio, se já for útil).
export function anteriorDiaUtil(iso: string, feriados?: Feriados): string {
  let ms = utcDeISO(iso);
  while (!ehDiaUtil(isoDeUTC(ms), feriados)) ms -= MS_DIA;
  return isoDeUTC(ms);
}

// Soma n dias ÚTEIS a partir da data (n pode ser negativo). Cada passo avança um
// dia de calendário e só decrementa a contagem quando cai num dia útil. n = 0
// retorna a própria data inalterada (não normaliza).
export function somarDiasUteis(iso: string, n: number, feriados?: Feriados): string {
  if (!Number.isFinite(n) || n === 0) return iso.slice(0, 10);
  const passo = n > 0 ? MS_DIA : -MS_DIA;
  let restantes = Math.abs(Math.trunc(n));
  let ms = utcDeISO(iso);
  while (restantes > 0) {
    ms += passo;
    if (ehDiaUtil(isoDeUTC(ms), feriados)) restantes -= 1;
  }
  return isoDeUTC(ms);
}

// Conta os dias ÚTEIS no intervalo INCLUSIVO [deISO, ateISO]. Se ate < de => 0.
export function contarDiasUteis(deISO: string, ateISO: string, feriados?: Feriados): number {
  const de = utcDeISO(deISO);
  const ate = utcDeISO(ateISO);
  if (!Number.isFinite(de) || !Number.isFinite(ate) || ate < de) return 0;
  let total = 0;
  for (let ms = de; ms <= ate; ms += MS_DIA) {
    if (ehDiaUtil(isoDeUTC(ms), feriados)) total += 1;
  }
  return total;
}
