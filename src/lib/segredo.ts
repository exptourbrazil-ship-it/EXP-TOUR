import crypto from "crypto";

// Comparacao de segredos em tempo constante. Compara o SHA-256 dos dois lados
// (tamanho fixo), entao nem o tamanho do segredo vaza pelo tempo de resposta.
export function segredoConfere(recebido: string | null | undefined, esperado: string): boolean {
  if (typeof recebido !== "string" || !esperado) return false;
  const a = crypto.createHash("sha256").update(recebido).digest();
  const b = crypto.createHash("sha256").update(esperado).digest();
  return crypto.timingSafeEqual(a, b);
}

// Confere o cabecalho `Authorization: Bearer <segredo>` em tempo constante.
export function bearerConfere(authorization: string | null | undefined, segredo: string): boolean {
  if (typeof authorization !== "string" || !segredo) return false;
  return segredoConfere(authorization, "Bearer " + segredo);
}
