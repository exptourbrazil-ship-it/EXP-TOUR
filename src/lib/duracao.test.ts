import { test } from "node:test";
import assert from "node:assert/strict";
import { validarDuracao, noitesDeSemanas } from "./duracao.ts";

test("semana so aceita inteiro", () => {
  assert.deepEqual(validarDuracao(4, "week"), { ok: true, quantidade: 4 });
  assert.deepEqual(validarDuracao("12", "week"), { ok: true, quantidade: 12 });
  const r = validarDuracao(2.5, "week");
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.erro, /semanas fechadas/);
});

test("mes tambem e fechado", () => {
  assert.equal(validarDuracao(1.5, "month").ok, false);
  assert.equal(validarDuracao(3, "month").ok, true);
});

test("dia e unidade aceitam fracionario (add-on de noites)", () => {
  assert.equal(validarDuracao(3, "day").ok, true);
  assert.equal(validarDuracao(1.5, "unit").ok, true);
});

test("quantidade invalida ou unidade ausente", () => {
  for (const q of [0, -1, "abc", null, undefined, NaN]) {
    assert.equal(validarDuracao(q, "week").ok, false, String(q));
  }
  assert.equal(validarDuracao(4, "").ok, false);
});

test("noitesDeSemanas", () => {
  assert.equal(noitesDeSemanas(4), 28);
  assert.equal(noitesDeSemanas(1), 7);
});
