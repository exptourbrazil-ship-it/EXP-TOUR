// Regua de cobranca: decide, para uma parcela, qual lembrete (se algum) deve
// ser enviado hoje, com base na distancia entre hoje e o vencimento.
//
// Helper puro (sem rede/DB) para ser testavel sem mocks, seguindo a convencao
// do projeto (helpers puros em src/lib com testes node:test).

// Janelas de lembrete: dias relativos ao vencimento. Positivo = antes do
// vencimento (lembrete preventivo); negativo = depois (parcela vencida).
export const JANELAS_LEMBRETE = [
  { janela: "D-3", offsetDias: 3 },
  { janela: "D0", offsetDias: 0 },
  { janela: "D+1", offsetDias: -1 },
  { janela: "D+5", offsetDias: -5 },
] as const;

export type Janela = (typeof JANELAS_LEMBRETE)[number]["janela"];

// Converte 'YYYY-MM-DD' para o numero de dias inteiros desde a epoch (UTC),
// ignorando hora/fuso. Retorna null se a data for invalida.
function diaUTC(dataISO: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dataISO || "");
  if (!m) return null;
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  const ts = Date.UTC(ano, mes - 1, dia);
  if (Number.isNaN(ts)) return null;
  return Math.floor(ts / 86400000);
}

// Diferenca em dias entre o vencimento e hoje (vencimento - hoje).
// Positivo = vence no futuro; zero = vence hoje; negativo = ja venceu.
export function diasAteVencimento(hojeISO: string, vencimentoISO: string): number | null {
  const h = diaUTC(hojeISO);
  const v = diaUTC(vencimentoISO);
  if (h === null || v === null) return null;
  return v - h;
}

// Retorna a janela de lembrete que se aplica hoje para um dado vencimento,
// ou null se hoje nao cai em nenhuma das janelas configuradas.
export function janelaLembrete(hojeISO: string, vencimentoISO: string): Janela | null {
  const dias = diasAteVencimento(hojeISO, vencimentoISO);
  if (dias === null) return null;
  const encontrada = JANELAS_LEMBRETE.find((j) => j.offsetDias === dias);
  return encontrada ? encontrada.janela : null;
}

// Uma janela "D+..." indica parcela ja vencida (lembrete de atraso).
export function janelaEhAtraso(janela: Janela): boolean {
  return janela.startsWith("D+");
}

// Regua de QUITACAO (Clausula 7.12): lembretes 30/15/5 dias ANTES da
// data-limite de quitacao (que e D-30 do inicio do programa; ver
// dataLimiteQuitacao em lib/parcelas). Distinta da regua por parcela acima —
// aqui a "data alvo" e a data-limite de quitacao do Saldo Devedor.
export const JANELAS_QUITACAO = [
  { janela: "D-30", offsetDias: 30 },
  { janela: "D-15", offsetDias: 15 },
  { janela: "D-5", offsetDias: 5 },
] as const;

export type JanelaQuitacao = (typeof JANELAS_QUITACAO)[number]["janela"];

// Janela de quitacao aplicavel hoje para uma data-limite, ou null. Exige
// execucao diaria do cron (match exato do dia), como a regua por parcela.
export function janelaQuitacao(
  hojeISO: string,
  dataLimiteISO: string | null | undefined
): JanelaQuitacao | null {
  if (!dataLimiteISO) return null;
  const dias = diasAteVencimento(hojeISO, dataLimiteISO);
  if (dias === null) return null;
  const encontrada = JANELAS_QUITACAO.find((j) => j.offsetDias === dias);
  return encontrada ? encontrada.janela : null;
}

// Avisos AMIGAVEIS de mora (Clausula 13): >=2 comunicacoes APOS a data-limite de
// quitacao, ANTES da suspensao (D+15). Diferente das janelas de quitacao (match
// exato de dia), aqui usamos LIMIAR de atraso — robusto a lacunas do cron: cada
// aviso dispara uma vez quando seu limiar e cruzado (idempotencia por
// (contrato, janela) em lembretes_quitacao). Percentuais/prazos sao [colchetes].
export const JANELAS_MORA = [
  { janela: "mora_1", atrasoDias: 3 },
  { janela: "mora_2", atrasoDias: 10 },
] as const;

export type JanelaMora = (typeof JANELAS_MORA)[number]["janela"];

// Janelas de aviso de mora cujo limiar de atraso JA foi alcancado hoje (o cron
// pula as ja enviadas). Vazio quando em dia ou antes do 1o limiar.
export function janelasMoraAplicaveis(hojeISO: string, dataLimiteISO: string | null | undefined): JanelaMora[] {
  if (!dataLimiteISO) return [];
  const dias = diasAteVencimento(hojeISO, dataLimiteISO); // negativo = atrasado
  if (dias === null) return [];
  const atraso = -dias;
  return JANELAS_MORA.filter((j) => atraso >= j.atrasoDias).map((j) => j.janela);
}
