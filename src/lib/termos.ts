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
