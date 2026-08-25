import crypto from "crypto";

// Sessao do Portal do Fornecedor, assinada com HMAC-SHA256, guardada num cookie
// httpOnly proprio (separado do cliente e do admin). Mesmo formato do
// lib/admin-session.ts: base64url(payload) + "." + assinatura.
//
// O payload carrega o id do usuario do fornecedor, o supplier_id (a instituicao)
// e o papel/idioma — tudo que o portal precisa sem reconsultar o banco a cada
// request. A autorizacao real (o que cada papel ve) e sempre reconferida em
// codigo nas rotas/paginas.

export const FORNECEDOR_SESSION_COOKIE = "exp_tour_fornecedor";

const SESSION_DURATION_SECONDS = 60 * 60 * 12; // 12 horas

export type SessaoFornecedor = {
  supplierUserId: string;
  supplierId: string;
  email: string;
  role: string;
  language: string;
};

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

// Cria um token de sessao de fornecedor, valido por 12 horas.
export function criarSessaoFornecedor(dados: SessaoFornecedor): string {
  const exp = Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS;
  const payloadJson = JSON.stringify({
    sub: dados.supplierUserId,
    sid: dados.supplierId,
    email: dados.email,
    role: dados.role,
    lang: dados.language,
    fornecedor: true,
    exp,
  });
  const payload = Buffer.from(payloadJson, "utf8").toString("base64url");
  return payload + "." + assinar(payload);
}

// Verifica um token de sessao de fornecedor. Retorna os dados se valido, ou null
// se a assinatura nao bater, o token estiver malformado ou expirado.
export function verificarSessaoFornecedor(token: string | undefined | null): SessaoFornecedor | null {
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
    const dados = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const agora = Math.floor(Date.now() / 1000);
    if (!dados || dados.fornecedor !== true) return null;
    if (typeof dados.exp !== "number" || dados.exp < agora) return null;
    if (!dados.sub || !dados.sid) return null;
    return {
      supplierUserId: String(dados.sub),
      supplierId: String(dados.sid),
      email: String(dados.email || ""),
      role: String(dados.role || "admissions"),
      language: String(dados.lang || "en"),
    };
  } catch {
    return null;
  }
}
