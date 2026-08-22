// Testes do token do codigo de login do admin (com e-mail embutido).
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.SESSION_SECRET = process.env.SESSION_SECRET || "segredo-de-teste-admin-codigo";

import { criarTokenCodigo, conferirTokenCodigo, verificarTokenCodigo } from "./admin-codigo.ts";

test("conferirTokenCodigo devolve o e-mail (minusculo) com o codigo certo", () => {
  const token = criarTokenCodigo("123456", "Ana@Exp-Tour.com");
  assert.deepEqual(conferirTokenCodigo(token, "123456"), { ok: true, email: "ana@exp-tour.com" });
});

test("codigo errado nao confere e nao vaza e-mail", () => {
  const token = criarTokenCodigo("123456", "ana@exp-tour.com");
  assert.deepEqual(conferirTokenCodigo(token, "000000"), { ok: false, email: null });
});

test("token sem e-mail (fluxo antigo) confere com email null", () => {
  const token = criarTokenCodigo("654321");
  assert.deepEqual(conferirTokenCodigo(token, "654321"), { ok: true, email: null });
});

test("token adulterado nao confere", () => {
  const token = criarTokenCodigo("111222", "b@e.com");
  assert.equal(conferirTokenCodigo(token + "z", "111222").ok, false);
  assert.equal(conferirTokenCodigo(null, "111222").ok, false);
});

test("verificarTokenCodigo (booleano) segue funcionando", () => {
  const token = criarTokenCodigo("999888", "c@e.com");
  assert.equal(verificarTokenCodigo(token, "999888"), true);
  assert.equal(verificarTokenCodigo(token, "123123"), false);
});
