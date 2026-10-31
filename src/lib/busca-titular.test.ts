import { test } from "node:test";
import assert from "node:assert/strict";
import { prepararBuscaNome } from "./busca-titular.ts";

test("prepararBuscaNome: exige 3 letras e normaliza espacos", () => {
  assert.equal(prepararBuscaNome(null), null);
  assert.equal(prepararBuscaNome("ab"), null);
  assert.equal(prepararBuscaNome("  Monik   Alves "), "Monik Alves");
});

test("prepararBuscaNome: neutraliza curingas do LIKE e separadores do filtro", () => {
  assert.equal(prepararBuscaNome("%%"), null);
  assert.equal(prepararBuscaNome("a_b%c"), "a b c");
  assert.equal(prepararBuscaNome("x),nome.eq.(y"), "x nome.eq. y");
});
