import crypto from "crypto";

// Token de verificação do código de acesso do admin (login por e-mail).
// Em vez de guardar o código no banco, geramos um token assinado (HMAC-SHA256)
// que contém apenas o HASH do código + expiração + finalidade. O token é
// guardado num cookie httpOnly de curta duração e conferido no /verify.
// Formato: base64url(payload) + "." + assinatura.

export const ADMIN_CODIGO_COOKIE = "exp_tour_admin_code";

const CODIGO_DURACAO_SEGUNDOS = 10 * 60; // 10 minutos

function getSecret(): string {
  const secret = process.env.ADMIN_SESSION_SECRET || process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("ADMIN_SESSION_SECRET nao configurado.");
  }
  return secret;
}

function assinar(payload: string): string {
  return crypto.createHmac("sha256", getSecret()).update(payload).digest("hex");
}

function hashCodigo(codigo: string): string {
  return crypto.createHmac("sha256", getSecret()).update("codigo:" + codigo).digest("hex");
}

// Cria um token assinado que representa o código enviado por e-mail.
export function criarTokenCodigo(codigo: string): string {
  const exp = Math.floor(Date.now() / 1000) + CODIGO_DURACAO_SEGUNDOS;
  const payloadJson = JSON.stringify({ h: hashCodigo(codigo), exp, tipo: "admin_codigo" });
  const payload = Buffer.from(payloadJson, "utf8").toString("base64url");
  const assinatura = assinar(payload);
  return payload + "." + assinatura;
}

// Confere o código enviado pelo usuário contra o token assinado do cookie.
// Retorna true somente se a assinatura for válida, não estiver expirado e o
// hash do código bater.
export function verificarTokenCodigo(token: string | undefined | null, codigo: string): boolean {
  if (!token || !codigo) return false;

  const partes = token.split(".");
  if (partes.length !== 2) return false;
  const [payload, assinatura] = partes;

  const assinaturaEsperada = assinar(payload);
  const bufferRecebido = Buffer.from(assinatura);
  const bufferEsperado = Buffer.from(assinaturaEsperada);
  if (
    bufferRecebido.length !== bufferEsperado.length ||
    !crypto.timingSafeEqual(bufferRecebido, bufferEsperado)
  ) {
    return false;
  }

  try {
    const dados = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (dados.tipo !== "admin_codigo") return false;
    const agora = Math.floor(Date.now() / 1000);
    if (typeof dados.exp !== "number" || dados.exp < agora) return false;

    const hashRecebido = Buffer.from(hashCodigo(codigo));
    const hashEsperado = Buffer.from(String(dados.h));
    if (hashRecebido.length !== hashEsperado.length) return false;
    return crypto.timingSafeEqual(hashRecebido, hashEsperado);
  } catch {
    return false;
  }
}

export function gerarCodigo(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}
