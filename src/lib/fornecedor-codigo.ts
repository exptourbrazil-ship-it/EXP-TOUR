import crypto from "crypto";

// Token de verificacao do codigo de login do fornecedor (login por e-mail).
// Mesmo desenho do admin (src/lib/admin-codigo.ts): em vez de guardar o codigo
// no banco, geramos um token assinado (HMAC-SHA256) que contem apenas o HASH do
// codigo + o e-mail + expiracao + finalidade. O token vive num cookie httpOnly
// de curta duracao e e conferido no /verify. Formato: base64url(payload)."."assinatura.

export const FORNECEDOR_CODIGO_COOKIE = "exp_tour_fornecedor_code";

const CODIGO_DURACAO_SEGUNDOS = 10 * 60; // 10 minutos

function getSecret(): string {
  const secret = process.env.SUPPLIER_SESSION_SECRET || process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SUPPLIER_SESSION_SECRET nao configurado.");
  }
  return secret;
}

function assinar(payload: string): string {
  return crypto.createHmac("sha256", getSecret()).update(payload).digest("hex");
}

function hashCodigo(codigo: string): string {
  return crypto.createHmac("sha256", getSecret()).update("codigo-fornecedor:" + codigo).digest("hex");
}

// Cria um token assinado que representa o codigo enviado por e-mail. O e-mail vai
// no payload ASSINADO para que o /verify saiba, de forma confiavel, QUEM esta
// logando (e busque o usuario em supplier_user) — o cliente nunca reinforma o
// e-mail no /verify, so o codigo.
export function criarTokenCodigo(codigo: string, email?: string | null): string {
  const exp = Math.floor(Date.now() / 1000) + CODIGO_DURACAO_SEGUNDOS;
  const payloadJson = JSON.stringify({
    h: hashCodigo(codigo),
    email: email ? email.trim().toLowerCase() : null,
    exp,
    tipo: "fornecedor_codigo",
  });
  const payload = Buffer.from(payloadJson, "utf8").toString("base64url");
  return payload + "." + assinar(payload);
}

// Confere o codigo contra o token assinado do cookie e devolve o e-mail que o
// token carrega (quando valido). `ok` so e true com assinatura valida, sem
// expirar e com o hash do codigo batendo.
export function conferirTokenCodigo(
  token: string | undefined | null,
  codigo: string
): { ok: boolean; email: string | null } {
  const falha = { ok: false, email: null };
  if (!token || !codigo) return falha;

  const partes = token.split(".");
  if (partes.length !== 2) return falha;
  const [payload, assinatura] = partes;

  const assinaturaEsperada = assinar(payload);
  const bufferRecebido = Buffer.from(assinatura);
  const bufferEsperado = Buffer.from(assinaturaEsperada);
  if (
    bufferRecebido.length !== bufferEsperado.length ||
    !crypto.timingSafeEqual(bufferRecebido, bufferEsperado)
  ) {
    return falha;
  }

  try {
    const dados = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (dados.tipo !== "fornecedor_codigo") return falha;
    const agora = Math.floor(Date.now() / 1000);
    if (typeof dados.exp !== "number" || dados.exp < agora) return falha;

    const hashRecebido = Buffer.from(hashCodigo(codigo));
    const hashEsperado = Buffer.from(String(dados.h));
    if (hashRecebido.length !== hashEsperado.length) return falha;
    if (!crypto.timingSafeEqual(hashRecebido, hashEsperado)) return falha;

    return { ok: true, email: typeof dados.email === "string" ? dados.email : null };
  } catch {
    return falha;
  }
}

// Gera um codigo de login de 6 digitos. crypto.randomInt (nao Math.random): e
// material de autenticacao. Ver a nota em admin-codigo.ts.
export function gerarCodigo(): string {
  return String(crypto.randomInt(100000, 1000000));
}
