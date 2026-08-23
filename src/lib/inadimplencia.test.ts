// Testes da regra pura da escalada por inadimplencia (E5).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  INADIMPLENCIA_DIAS_PADRAO,
  PRAZO_CURA_DIAS_PADRAO,
  elegivelInadimplencia,
} from "./inadimplencia.ts";

test("elegivelInadimplencia: escala a partir do limiar (inclusive)", () => {
  assert.equal(elegivelInadimplencia(29, 30), false);
  assert.equal(elegivelInadimplencia(30, 30), true);
  assert.equal(elegivelInadimplencia(45, 30), true);
  assert.equal(elegivelInadimplencia(0, 30), false);
  assert.equal(elegivelInadimplencia(-5, 30), false); // ainda vai vencer
  // limiar customizavel (config futura)
  assert.equal(elegivelInadimplencia(15, 15), true);
  assert.equal(elegivelInadimplencia(14, 15), false);
});

test("defaults do doc", () => {
  assert.equal(INADIMPLENCIA_DIAS_PADRAO, 30);
  assert.equal(PRAZO_CURA_DIAS_PADRAO, 10);
});
