// Helpers puros do webhook do Mercado Pago: validacao de assinatura HMAC,
// montagem da chave de idempotencia e extracao do id do pagamento.
//
// Mantidos aqui, sem dependencia de rede ou banco, para serem testaveis
// isoladamente (ver mp-events.test.ts). A rota do webhook usa estes helpers.
import crypto from "node:crypto";

export type PartesAssinatura = { ts: string; v1: string } | null;

// Faz o parse do header "x-signature" do Mercado Pago, no formato
// "ts=<timestamp>,v1=<hash>". Retorna null se faltar ts ou v1.
export function parseSignatureHeader(header: string | null | undefined): PartesAssinatura {
  if (!header) return null;
  const partes: Record<string, string> = {};
  for (const item of header.split(",")) {
    const idx = item.indexOf("=");
    if (idx === -1) continue;
    const chave = item.slice(0, idx).trim();
    const valor = item.slice(idx + 1).trim();
    if (chave) partes[chave] = valor;
  }
  if (!partes.ts || !partes.v1) return null;
  return { ts: partes.ts, v1: partes.v1 };
}

// Monta o "manifest" que o Mercado Pago assina, conforme a documentacao:
//   id:<data.id>;request-id:<x-request-id>;ts:<ts>;
// Segmentos ausentes sao omitidos. O data.id vai sempre em minusculas (a doc
// pede minusculas quando alfanumerico; ids numericos nao sao afetados).
export function montarManifest(opts: {
  dataId?: string | null;
  requestId?: string | null;
  ts: string;
}): string {
  let manifest = "";
  if (opts.dataId) manifest += `id:${String(opts.dataId).toLowerCase()};`;
  if (opts.requestId) manifest += `request-id:${opts.requestId};`;
  manifest += `ts:${opts.ts};`;
  return manifest;
}

// Valida a assinatura HMAC-SHA256 de uma notificacao do Mercado Pago.
// Sem secret configurado, retorna false (chamador decide como tratar).
export function verificarAssinaturaMercadoPago(opts: {
  signatureHeader: string | null | undefined;
  requestId: string | null | undefined;
  dataId: string | null | undefined;
  secret: string | undefined | null;
}): boolean {
  const { signatureHeader, requestId, dataId, secret } = opts;
  if (!secret) return false;

  const partes = parseSignatureHeader(signatureHeader);
  if (!partes) return false;

  const manifest = montarManifest({ dataId, requestId, ts: partes.ts });
  const esperado = crypto.createHmac("sha256", secret).update(manifest).digest("hex");

  const bufEsperado = Buffer.from(esperado);
  const bufRecebido = Buffer.from(partes.v1);
  if (bufEsperado.length !== bufRecebido.length) return false;
  return crypto.timingSafeEqual(bufEsperado, bufRecebido);
}

// Extrai o id do pagamento de uma notificacao do MP. Prioriza o query param
// "data.id" (recomendado pela doc, pois e o valor usado na assinatura), com
// fallback para "id" no query string e, por fim, para o corpo.
export function extrairPaymentId(opts: { url?: string | null; body?: unknown }): string | null {
  const { url, body } = opts;

  if (url) {
    try {
      const u = new URL(url);
      const q = u.searchParams.get("data.id") || u.searchParams.get("id");
      if (q) return String(q);
    } catch {
      // URL invalida: ignora e tenta o corpo.
    }
  }

  const b = body as { data?: { id?: unknown }; id?: unknown } | null | undefined;
  const doBody = b?.data?.id ?? b?.id;
  return doBody != null ? String(doBody) : null;
}

// Monta a chave de idempotencia do ledger de eventos.
// Ex: montarIdempotencyKey("mercadopago", "payment", "123") -> "mercadopago:payment:123"
export function montarIdempotencyKey(source: string, tipo: string, id: string): string {
  return `${source}:${tipo}:${id}`;
}
