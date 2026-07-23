// Regua de cobranca: decide, para uma parcela, qual lembrete (se algum) deve
// ser enviado hoje, com base na distancia entre hoje e o vencimento.
//
// Helper puro (sem rede/DB) para ser testavel sem mocks, seguindo a convencao
// do projeto (helpers puros em src/lib com testes node:test).

// Janelas de lembrete: dias relativos ao vencimento. Positivo = antes do
// vencimento (lembrete preventivo); negativo = depois (parcela vencida).
export const JANELAS_LEMBRETE = [
  { janela: "D-7", offsetDias: 7 },
  { janela: "D-2", offsetDias: 2 },
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
