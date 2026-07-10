import crypto from "crypto";

// Sessao simples e assinada (HMAC-SHA256) guardada em um cookie httpOnly.
// Nao usamos uma biblioteca de JWT externa para manter o projeto sem
// dependencias adicionais; o formato e: base64url(payload) + "." + assinatura.

export const SESSION_COOKIE = "exp_tour_session";

const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 30; // 30 dias

function getSecret(): string {
    const secret = process.env.SESSION_SECRET;
    if (!secret) {
          throw new Error("SESSION_SECRET nao configurado.");
    }
    return secret;
}

function assinar(payload: string): string {
    return crypto.createHmac("sha256", getSecret()).update(payload).digest("hex");
}

// Cria um token de sessao contendo o titular_id, valido por 30 dias.
export function criarSessao(titularId: string): string {
    const exp = Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS;
    const payloadJson = JSON.stringify({ titularId, exp });
    const payload = Buffer.from(payloadJson, "utf8").toString("base64url");
    const assinatura = assinar(payload);
    return `${payload}.${assinatura}`;
}

// Verifica um token de sessao. Retorna o titular_id se for valido, ou null
// se a assinatura nao bater, o token estiver malformado, ou tiver expirado.
export function verificarSessao(token: string | undefined | null): { titularId: string } | null {
    if (!token) return null;

  const partes = token.split(".");
    if (partes.length !== 2) return null;
    const [payload, assinatura] = partes;

  const assinaturaEsperada = assinar(payload);
    const bufferRecebido = Buffer.from(assinatura);
    const bufferEsperado = Buffer.from(assinaturaEsperada);

  if (
        bufferRecebido.length !== bufferEsperado.length ||
        !crypto.timingSafeEqual(bufferRecebido, bufferEsperado)
      ) {
        return null;
  }

  try {
        const dadosJson = Buffer.from(payload, "base64url").toString("utf8");
        const dados = JSON.parse(dadosJson);
        const agora = Math.floor(Date.now() / 1000);
        if (!dados.titularId || !dados.exp || dados.exp < agora) {
                return null;
        }
        return { titularId: dados.titularId };
  } catch {
        return null;
  }
}
