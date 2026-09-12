// Validade da cobrança Pix (Cláusula 6.5): a cobrança gerada vale até as 23h59
// do MESMO dia (fuso de São Paulo), porque a cotação do dia só se confirma na
// geração e não pode valer indefinidamente. PURO — sem imports de runtime — para
// ser testado sem mocks.
//
// São Paulo é UTC-03:00 fixo (sem horário de verão desde 2019). Formato de saída
// = ISO 8601 com offset, aceito pelo Mercado Pago em date_of_expiration.

const SP_OFFSET_MS = 3 * 60 * 60 * 1000; // -03:00
const DIA_MS = 24 * 60 * 60 * 1000;

// Fim do dia (23:59:59) em São Paulo para o instante informado, como ISO com
// offset -03:00. Lança se a data for inválida.
//
// `minMinutos`: janela mínima de validade. O Mercado Pago recusa um Pix com
// expiração muito próxima do agora; se faltar menos que isso para as 23h59 de
// hoje (ex.: cobrança gerada às 23h50), rola para o fim do dia SEGUINTE — ainda
// "23h59", só que de amanhã — em vez de gerar uma cobrança que seria rejeitada.
export function fimDoDiaSaoPauloISO(agoraISO: string, minMinutos = 30): string {
  const t = new Date(agoraISO).getTime();
  if (!Number.isFinite(t)) throw new Error("data inválida");
  // Desloca o instante para o "relógio" de SP e lê a data em UTC.
  let sp = new Date(t - SP_OFFSET_MS);
  // Instante UTC real do 23:59:59 de HOJE em SP (local -03:00 -> +3h em UTC).
  const fimHojeUtcMs =
    Date.UTC(sp.getUTCFullYear(), sp.getUTCMonth(), sp.getUTCDate(), 23, 59, 59) + SP_OFFSET_MS;
  if (fimHojeUtcMs - t < minMinutos * 60 * 1000) {
    sp = new Date(sp.getTime() + DIA_MS); // rola para amanhã
  }
  const y = sp.getUTCFullYear();
  const m = String(sp.getUTCMonth() + 1).padStart(2, "0");
  const d = String(sp.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}T23:59:59.000-03:00`;
}
