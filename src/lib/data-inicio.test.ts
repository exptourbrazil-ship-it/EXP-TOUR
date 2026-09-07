// Testes do helper puro do editor de data de inicio. `npm test` (node --test).
import { test } from "node:test";
import assert from "node:assert/strict";
import { resumoDatasInicio } from "./data-inicio.ts";

test("resumoDatasInicio conta com/sem data (espaco conta como sem)", () => {
  const r = resumoDatasInicio([
    { data_inicio: "2026-08-01" },
    { data_inicio: null },
    { data_inicio: "   " },
    { data_inicio: "2026-09-15" },
  ]);
  assert.deepEqual(r, { total: 4, comData: 2, semData: 2 });
});

test("resumoDatasInicio vazio", () => {
  assert.deepEqual(resumoDatasInicio([]), { total: 0, comData: 0, semData: 0 });
});
