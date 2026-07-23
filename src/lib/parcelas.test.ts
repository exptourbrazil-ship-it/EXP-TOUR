// Testes dos helpers puros de parcelas.
// Roda com o runner nativo do Node: `npm test` (node --test), sem dependencias.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  somaValoresParcelas,
  somaParcelasConfere,
  TOLERANCIA_SOMA_PARCELAS,
} from "./parcelas.ts";

test("somaValoresParcelas soma e arredonda para centavos", () => {
  assert.equal(somaValoresParcelas([100, 200.5, 99.5]), 400);
  assert.equal(somaValoresParcelas([0.1, 0.2]), 0.3);
});

test("somaValoresParcelas ignora valores nao numericos como zero", () => {
  assert.equal(somaValoresParcelas([100, NaN as unknown as number]), 100);
});

test("somaParcelasConfere aceita soma igual ao total", () => {
  assert.equal(somaParcelasConfere([1000, 2000, 3000], 6000), true);
});

test("somaParcelasConfere aceita divergencia dentro da tolerancia (centavos)", () => {
  // 33.33 * 3 = 99.99, total 100.00 -> diferenca 0.01, dentro da tolerancia.
  assert.equal(somaParcelasConfere([33.33, 33.33, 33.33], 100), true);
  assert.equal(TOLERANCIA_SOMA_PARCELAS, 0.01);
});

test("somaParcelasConfere rejeita soma menor que o total", () => {
  assert.equal(somaParcelasConfere([1000, 2000], 6000), false);
});

test("somaParcelasConfere rejeita soma maior que o total", () => {
  assert.equal(somaParcelasConfere([1000, 2000, 3001], 6000), false);
});

test("somaParcelasConfere respeita tolerancia customizada", () => {
  assert.equal(somaParcelasConfere([100], 105, 5), true);
  assert.equal(somaParcelasConfere([100], 106, 5), false);
});
