// Testes do helper puro de conversao de câmbio.
// Roda com o runner nativo do Node: `npm test` (node --test), sem dependencias.
import { test } from "node:test";
import assert from "node:assert/strict";
import { converterParaBRL } from "./cambio.ts";

test("converterParaBRL multiplica valor pela cotacao_vet, sem taxa fixa", () => {
  // cotacao_vet ja embute BACEN + spread + IOF; sem os R$ 4,99 antigos.
  assert.equal(converterParaBRL(100, 5), 500);
});

test("converterParaBRL arredonda para centavos", () => {
  // 123.45 * 5.6789 = 701.0603... -> 701.06
  assert.equal(converterParaBRL(123.45, 5.6789), 701.06);
});

test("converterParaBRL nao adiciona a taxa administrativa fixa de 4,99", () => {
  // Antes o resultado era valor * cotacao + 4.99; agora e apenas a conversao.
  const valor = 200;
  const cotacao = 3.5;
  assert.equal(converterParaBRL(valor, cotacao), 700);
  assert.notEqual(converterParaBRL(valor, cotacao), 704.99);
});

test("converterParaBRL retorna 0 para valor zero", () => {
  assert.equal(converterParaBRL(0, 5.5), 0);
});
