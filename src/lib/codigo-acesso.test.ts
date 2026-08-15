import test from "node:test";
import assert from "node:assert/strict";

process.env.SESSION_SECRET = process.env.SESSION_SECRET || "segredo-de-teste";

const { hashCodigoAcesso, conferirCodigoAcesso } = await import("./codigo-acesso.ts");

test("o hash nao revela o codigo e e estavel", () => {
  const h = hashCodigoAcesso("123456");
  assert.notEqual(h, "123456");
  assert.equal(h.length, 64);
  assert.equal(h, hashCodigoAcesso("123456"));
  assert.notEqual(h, hashCodigoAcesso("123457"));
});

test("confere pelo hash quando a linha tem codigo_hash", () => {
  const linha = { codigo_hash: hashCodigoAcesso("654321") };
  assert.equal(conferirCodigoAcesso("654321", linha), true);
  assert.equal(conferirCodigoAcesso("654322", linha), false);
  assert.equal(conferirCodigoAcesso(" 654321 ", linha), true); // tolera espacos
});

test("aceita linha antiga em texto claro durante a transicao", () => {
  // Linhas gravadas antes da migracao; expiram em 10 min e somem sozinhas.
  assert.equal(conferirCodigoAcesso("111111", { codigo: "111111" }), true);
  assert.equal(conferirCodigoAcesso("222222", { codigo: "111111" }), false);
});

test("o hash tem precedencia sobre o texto claro", () => {
  const linha = { codigo_hash: hashCodigoAcesso("999999"), codigo: "111111" };
  assert.equal(conferirCodigoAcesso("999999", linha), true);
  assert.equal(conferirCodigoAcesso("111111", linha), false);
});

test("codigo vazio ou linha sem nada nunca autentica", () => {
  assert.equal(conferirCodigoAcesso("", { codigo_hash: hashCodigoAcesso("") }), false);
  assert.equal(conferirCodigoAcesso("123456", {}), false);
});
