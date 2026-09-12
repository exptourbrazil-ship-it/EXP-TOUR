// Validade da cobrança Pix (Cláusula 6.5): a cobrança gerada vale até as 23h59
// do MESMO dia (fuso de São Paulo), porque a cotação do dia só se confirma na
// geração e não pode valer indefinidamente. PURO — sem imports de runtime — para
// ser testado sem mocks.
//
// São Paulo é UTC-03:00 fixo (sem horário de verão desde 2019). Formato de saída
// = ISO 8601 com offset, aceito pelo Mercado Pago em date_of_expiration.

const SP_OFFSET_MS = 3 * 60 * 60 * 1000; // -03:00

// Fim do dia (23:59:59) em São Paulo para o instante informado, como ISO com
// offset -03:00. Lança se a data for inválida.
export function fimDoDiaSaoPauloISO(agoraISO: string): string {
  const t = new Date(agoraISO).getTime();
  if (!Number.isFinite(t)) throw new Error("data inválida");
  // Desloca o instante para o "relógio" de SP e lê a data em UTC.
  const sp = new Date(t - SP_OFFSET_MS);
  const y = sp.getUTCFullYear();
  const m = String(sp.getUTCMonth() + 1).padStart(2, "0");
  const d = String(sp.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}T23:59:59.000-03:00`;
}
