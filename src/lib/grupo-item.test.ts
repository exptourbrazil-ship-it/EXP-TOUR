import { test } from "node:test";
import assert from "node:assert/strict";
import { ehGrupoCurso, GRUPOS_CURSO } from "./grupo-item.ts";

test("curso e pacote fazem o papel de programa; o resto nao", () => {
  assert.equal(ehGrupoCurso("program"), true);
  assert.equal(ehGrupoCurso("package"), true);
  for (const g of ["accommodation", "insurance", "other", "", undefined, null, 3]) {
    assert.equal(ehGrupoCurso(g), false);
  }
  assert.deepEqual([...GRUPOS_CURSO], ["program", "package"]);
});
