// Testes dos helpers puros do webhook do Mercado Pago.
// Roda com o runner nativo do Node: `npm test` (node --test), sem dependencias.
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  parseSignatureHeader,
  montarManifest,
  verificarAssinaturaMercadoPago,
  extrairPaymentId,
  montarIdempotencyKey,
} from "./mp-events.ts";

test("parseSignatureHeader faz o parse de ts e v1", () => {
  const r = parseSignatureHeader("ts=1704908010,v1=abc123");
  assert.deepEqual(r, { ts: "1704908010", v1: "abc123" });
});

test("parseSignatureHeader tolera espacos e ordem invertida", () => {
  const r = parseSignatureHeader(" v1=deadbeef , ts=42 ");
  assert.deepEqual(r, { ts: "42", v1: "deadbeef" });
});

test("parseSignatureHeader retorna null quando falta ts ou v1", () => {
  assert.equal(parseSignatureHeader("ts=1"), null);
  assert.equal(parseSignatureHeader("v1=x"), null);
  assert.equal(parseSignatureHeader(""), null);
  assert.equal(parseSignatureHeader(undefined), null);
});

test("montarManifest inclui os tres segmentos e minuscula o data.id", () => {
  const m = montarManifest({ dataId: "ABC123", requestId: "req-9", ts: "42" });
  assert.equal(m, "id:abc123;request-id:req-9;ts:42;");
});

test("montarManifest omite segmentos ausentes", () => {
  assert.equal(montarManifest({ ts: "42" }), "ts:42;");
  assert.equal(montarManifest({ dataId: "7", ts: "42" }), "id:7;ts:42;");
});

// Assinatura valida: montamos o manifest do mesmo jeito que o servidor e
// calculamos o v1 esperado com o secret conhecido.
function assinar(secret: string, manifest: string): string {
  return crypto.createHmac("sha256", secret).update(manifest).digest("hex");
}

test("verificarAssinaturaMercadoPago aceita assinatura valida", () => {
  const secret = "segredo-de-teste";
  const ts = "1704908010";
  const dataId = "123456";
  const requestId = "req-abc";
  const manifest = montarManifest({ dataId, requestId, ts });
  const v1 = assinar(secret, manifest);

  const ok = verificarAssinaturaMercadoPago({
    signatureHeader: `ts=${ts},v1=${v1}`,
    requestId,
    dataId,
    secret,
  });
  assert.equal(ok, true);
});

test("verificarAssinaturaMercadoPago rejeita secret errado", () => {
  const ts = "1704908010";
  const dataId = "123456";
  const requestId = "req-abc";
  const v1 = assinar("secret-certo", montarManifest({ dataId, requestId, ts }));

  const ok = verificarAssinaturaMercadoPago({
    signatureHeader: `ts=${ts},v1=${v1}`,
    requestId,
    dataId,
    secret: "secret-errado",
  });
  assert.equal(ok, false);
});

test("verificarAssinaturaMercadoPago rejeita data.id adulterado", () => {
  const secret = "segredo-de-teste";
  const ts = "1704908010";
  const requestId = "req-abc";
  const v1 = assinar(secret, montarManifest({ dataId: "123456", requestId, ts }));

  const ok = verificarAssinaturaMercadoPago({
    signatureHeader: `ts=${ts},v1=${v1}`,
    requestId,
    dataId: "999999", // id trocado por um atacante
    secret,
  });
  assert.equal(ok, false);
});

test("verificarAssinaturaMercadoPago retorna false sem secret ou sem header", () => {
  assert.equal(
    verificarAssinaturaMercadoPago({ signatureHeader: "ts=1,v1=x", requestId: "r", dataId: "1", secret: undefined }),
    false
  );
  assert.equal(
    verificarAssinaturaMercadoPago({ signatureHeader: null, requestId: "r", dataId: "1", secret: "s" }),
    false
  );
});

test("extrairPaymentId prioriza o query param data.id", () => {
  assert.equal(
    extrairPaymentId({ url: "https://x.com/webhook?data.id=111&type=payment", body: { data: { id: 222 } } }),
    "111"
  );
});

test("extrairPaymentId cai para 'id' no query e depois para o corpo", () => {
  assert.equal(extrairPaymentId({ url: "https://x.com/webhook?id=111" }), "111");
  assert.equal(extrairPaymentId({ url: "https://x.com/webhook", body: { data: { id: 333 } } }), "333");
  assert.equal(extrairPaymentId({ body: { id: 444 } }), "444");
});

test("extrairPaymentId retorna null quando nao ha id", () => {
  assert.equal(extrairPaymentId({ url: "https://x.com/webhook", body: {} }), null);
  assert.equal(extrairPaymentId({}), null);
});

test("montarIdempotencyKey compoe source:tipo:id", () => {
  assert.equal(montarIdempotencyKey("mercadopago", "payment", "123"), "mercadopago:payment:123");
});
