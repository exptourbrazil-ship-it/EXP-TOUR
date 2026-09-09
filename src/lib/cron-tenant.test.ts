import { test } from "node:test";
import assert from "node:assert/strict";
import { deployEhLegado, emLotes } from "./cron-tenant.ts";

test("deployEhLegado: o deploy do slug legado e dono dos registros NULL", () => {
  assert.equal(deployEhLegado("exp-tour", "exp-tour"), true);
  assert.equal(deployEhLegado("forio", "exp-tour"), false);
  // legadoSlug configuravel (env TENANT_LEGADO_SLUG)
  assert.equal(deployEhLegado("forio", "forio"), true);
  assert.equal(deployEhLegado("exp-tour", "forio"), false);
});

test("emLotes: quebra a lista em pedacos do tamanho pedido", () => {
  assert.deepEqual(emLotes([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(emLotes([1, 2], 5), [[1, 2]]);
  assert.deepEqual(emLotes([], 3), []);
});

test("emLotes: tamanho invalido lanca", () => {
  assert.throws(() => emLotes([1], 0));
  assert.throws(() => emLotes([1], -1));
});
