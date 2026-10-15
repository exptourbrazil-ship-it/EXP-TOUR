import { test } from "node:test";
import assert from "node:assert/strict";
import { bearerConfere, segredoConfere } from "./segredo.ts";

test("bearer correto passa", () => {
  assert.equal(bearerConfere("Bearer abc123", "abc123"), true);
});

test("bearer errado, vazio ou ausente falha", () => {
  assert.equal(bearerConfere("Bearer abc124", "abc123"), false);
  assert.equal(bearerConfere("abc123", "abc123"), false);
  assert.equal(bearerConfere(null, "abc123"), false);
  assert.equal(bearerConfere(undefined, "abc123"), false);
  assert.equal(bearerConfere("Bearer ", "abc123"), false);
});

test("segredo esperado vazio nunca confere (falha fechada)", () => {
  assert.equal(bearerConfere("Bearer ", ""), false);
  assert.equal(segredoConfere("", ""), false);
});

test("segredoConfere aceita tamanhos diferentes sem lancar", () => {
  assert.equal(segredoConfere("curto", "um-segredo-bem-mais-longo"), false);
  assert.equal(segredoConfere("igual", "igual"), true);
});
