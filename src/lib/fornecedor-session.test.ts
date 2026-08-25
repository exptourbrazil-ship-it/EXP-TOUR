// Testes da sessao do Portal do Fornecedor (cookie HMAC).
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

process.env.SESSION_SECRET = process.env.SESSION_SECRET || "segredo-de-teste-fornecedor";

import { criarSessaoFornecedor, verificarSessaoFornecedor } from "./fornecedor-session.ts";

const base = {
  supplierUserId: "u-1",
  supplierId: "s-1",
  email: "escola@exemplo.com",
  role: "admissions",
  language: "en",
};

test("criar/verificar sessao de fornecedor (ida e volta)", () => {
  const token = criarSessaoFornecedor(base);
  assert.deepEqual(verificarSessaoFornecedor(token), base);
});

test("verificarSessaoFornecedor rejeita token adulterado", () => {
  const token = criarSessaoFornecedor(base);
  const [payload] = token.split(".");
  assert.equal(verificarSessaoFornecedor(payload + ".deadbeef"), null);
});

test("verificarSessaoFornecedor rejeita token malformado ou vazio", () => {
  assert.equal(verificarSessaoFornecedor(""), null);
  assert.equal(verificarSessaoFornecedor(null), null);
  assert.equal(verificarSessaoFornecedor("sem-ponto"), null);
});

test("verificarSessaoFornecedor rejeita sessao expirada", () => {
  // Monta um payload valido mas com exp no passado, assinado com o mesmo segredo.
  const secret = process.env.SESSION_SECRET as string;
  const payloadJson = JSON.stringify({
    sub: "u-1",
    sid: "s-1",
    email: "a@b.com",
    role: "admissions",
    lang: "en",
    fornecedor: true,
    exp: Math.floor(Date.now() / 1000) - 10,
  });
  const payload = Buffer.from(payloadJson, "utf8").toString("base64url");
  const assinatura = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  assert.equal(verificarSessaoFornecedor(payload + "." + assinatura), null);
});
