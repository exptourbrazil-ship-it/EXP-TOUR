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

// Cria um token assinado que representa o código enviado por e-mail. O e-mail
// do destinatário entra no payload ASSINADO para que o /verify saiba, de forma
// confiável, QUEM está logando (e busque o papel em admin_users) — o cliente
// nunca informa o e-mail no /verify, só o código.
export function criarTokenCodigo(codigo: string, email?: string | null): string {
  const exp = Math.floor(Date.now() / 1000) + CODIGO_DURACAO_SEGUNDOS;
  const payloadJson = JSON.stringify({
    h: hashCodigo(codigo),
    email: email ? email.trim().toLowerCase() : null,
    exp,
    tipo: "admin_codigo",
  });
  const payload = Buffer.from(payloadJson, "utf8").toString("base64url");
  const assinatura = assinar(payload);
  return payload + "." + assinatura;
}

// Confere o código contra o token assinado do cookie e devolve o e-mail que o
// token carrega (quando válido). `ok` só é true com assinatura válida, sem
// expirar e com o hash do código batendo. `email` é null em tokens antigos
// (criados antes do login multiusuário).
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
    if (dados.tipo !== "admin_codigo") return falha;
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

// Compatibilidade: mantém a checagem booleana (delegando à conferirTokenCodigo).
export function verificarTokenCodigo(token: string | undefined | null, codigo: string): boolean {
  return conferirTokenCodigo(token, codigo).ok;
}

// Ver a nota em auth/request-code: Math.random nao serve para material de
// autenticacao. Aqui o impacto era maior — este e o codigo do admin.
export function gerarCodigo(): string {
  return String(crypto.randomInt(100000, 1000000));
}
