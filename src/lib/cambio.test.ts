// Testes do helper puro de conversao de câmbio.
// Roda com o runner nativo do Node: `npm test` (node --test), sem dependencias.
import { test } from "node:test";
import assert from "node:assert/strict";
import { converterParaBRL, itemizarRecibo, comporCotacaoVet } from "./cambio.ts";

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

test("comporCotacaoVet: modelo ADITIVO (IOF nao incide sobre o spread)", () => {
  // 4,00 x (1 + 0,066 + 0,035) = 4,404 (o multiplicativo antigo dava 4,41324)
  assert.equal(comporCotacaoVet(4, 0.066, 0.035), 4.404);
});

test("itemizarRecibo: IOF sobre o valor convertido, NAO sobre o spread", () => {
  const vet = comporCotacaoVet(4, 0.066, 0.035); // PTAX 4,00 -> VET 4,404
  const itens = itemizarRecibo(1000, vet, 0.066, 0.035);
  assert.equal(Math.round(itens.ptax * 100) / 100, 4.0);
  assert.equal(itens.subtotal, 4000);
  assert.equal(itens.taxaIntermediacao, 264); // 6,6% de 4000
  assert.equal(itens.iof, 140); // 3,5% de 4000 (NAO de 4264)
  assert.equal(itens.amortizacaoMoeda, 1000);
  assert.equal(itens.totalBRL, converterParaBRL(1000, vet)); // 4404
});

test("itemizarRecibo respeita percentuais customizados (ex.: IOF alterado)", () => {
  const vet = comporCotacaoVet(5, 0.066, 0.011); // IOF 1,1%
  const itens = itemizarRecibo(200, vet, 0.066, 0.011);
  assert.equal(itens.iofPercentual, 0.011);
  assert.equal(itens.iof, 11); // 1,1% de 1000
  assert.equal(itens.totalBRL, converterParaBRL(200, vet));
});
