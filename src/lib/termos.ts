import crypto from "crypto";

// Helpers do Termo de Adesão. O hash do conteúdo é a "impressão digital" da
// versão aceita: guardado junto ao aceite, prova QUAL texto o cliente aceitou,
// mesmo que o registro do termo mude depois. Determinístico e sem rede — testável.

// SHA-256 (hex) do conteúdo do termo. Normaliza quebras de linha (\r\n -> \n)
// para o hash não mudar só por diferença de sistema operacional na edição.
export function calcularHashTermo(conteudo: string): string {
  const normalizado = (conteudo || "").replace(/\r\n/g, "\n");
  return crypto.createHash("sha256").update(normalizado, "utf8").digest("hex");
}

// Direito de arrependimento (CDC art. 49): 7 dias corridos a partir do aceite.
export const DIAS_ARREPENDIMENTO = 7;

// Data-limite do arrependimento: aceite + 7 dias (ISO). Recebe o timestamp do
// aceite (ISO). Puro e determinístico.
export function prazoArrependimentoISO(dataHoraAceiteISO: string): string {
  const base = new Date(dataHoraAceiteISO).getTime();
  return new Date(base + DIAS_ARREPENDIMENTO * 24 * 60 * 60 * 1000).toISOString();
}

// `true` se `agoraISO` ainda está dentro dos 7 dias a partir do aceite.
export function dentroDoPrazoArrependimento(dataHoraAceiteISO: string, agoraISO: string): boolean {
  return new Date(agoraISO).getTime() <= new Date(prazoArrependimentoISO(dataHoraAceiteISO)).getTime();
}
