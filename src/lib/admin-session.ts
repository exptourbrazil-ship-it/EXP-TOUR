import crypto from "crypto";
// Import de TIPO apenas (apagado em runtime). A validade do papel e garantida
// por quem assina a sessao (login/verify checa admin_users via
// admin-roles.papelValido antes de chamar criarSessaoAdmin).
import type { PapelAdmin } from "./admin-roles";

// Sessao de administrador, assinada com HMAC-SHA256, guardada em um cookie
// httpOnly separado da sessao dos clientes. Mesmo formato do lib/session.ts:
// base64url(payload) + "." + assinatura.

// O nome do cookie vive em session-constants.ts (sem dependencia de crypto)
// para poder ser importado pelo proxy/middleware no Edge Runtime. Reexportamos
// aqui por compatibilidade com os consumidores que ja importam deste modulo.
export { ADMIN_SESSION_COOKIE } from "./session-constants";

const ADMIN_SESSION_DURATION_SECONDS = 60 * 60 * 12; // 12 horas

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

// Cria um token de sessao de admin, valido por 12 horas. O papel entra no
// payload assinado para a autorizacao por capacidade (ver admin-roles.ts).
export function criarSessaoAdmin(usuario: string, papel: PapelAdmin = "gestor"): string {
  const exp = Math.floor(Date.now() / 1000) + ADMIN_SESSION_DURATION_SECONDS;
  const payloadJson = JSON.stringify({ usuario, papel, admin: true, exp });
  const payload = Buffer.from(payloadJson, "utf8").toString("base64url");
  const assinatura = assinar(payload);
  return payload + "." + assinatura;
}

// Verifica um token de sessao de admin. Retorna { usuario, papel } se valido,
// ou null. Compatibilidade: tokens antigos (emitidos antes do multiusuario) nao
// tem papel — como o unico admin de entao era o Gestor semeado, o padrao e
// "gestor" e esses tokens expiram em ate 12h.
export function verificarSessaoAdmin(
  token: string | undefined | null
): { usuario: string; papel: PapelAdmin } | null {
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
    if (!dados || dados.admin !== true) return null;
    if (typeof dados.exp !== "number" || dados.exp < agora) return null;
    // Papel ausente => token antigo (pre-multiusuario), do Gestor semeado.
    // Papel desconhecido nao vira gestor: a autorizacao (podeAdmin) so libera
    // capacidades de papeis conhecidos, entao um valor estranho falha fechado.
    const papel = (typeof dados.papel === "string" && dados.papel ? dados.papel : "gestor") as PapelAdmin;
    return { usuario: String(dados.usuario || "admin"), papel };
  } catch {
    return null;
  }
}

// Compara duas strings em tempo constante (evita timing attacks nas credenciais).
export function compararSeguro(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}
