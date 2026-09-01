// Testes do helper puro de conversao de câmbio.
// Roda com o runner nativo do Node: `npm test` (node --test), sem dependencias.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  converterParaBRL,
  itemizarRecibo,
  comporCotacaoVet,
  extrairComercial,
  recomporVetTenant,
  SPREAD_PADRAO,
  IOF_PADRAO,
} from "./cambio.ts";

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

test("comporCotacaoVet: default usa spread 5% + IOF 3,5% (aditivo)", () => {
  // 4,00 x (1 + 0,05 + 0,035) = 4,34 (default sem passar percentuais).
  assert.equal(comporCotacaoVet(4), 4.34);
  assert.equal(comporCotacaoVet(4, SPREAD_PADRAO, IOF_PADRAO), 4.34);
});

test("comporCotacaoVet: modelo ADITIVO (IOF nao incide sobre o spread)", () => {
  // 4,00 x (1 + 0,05 + 0,035) = 4,34 (o multiplicativo daria 4,3407)
  assert.equal(comporCotacaoVet(4, 0.05, 0.035), 4.34);
});

test("itemizarRecibo: IOF sobre o valor convertido, NAO sobre o spread", () => {
  const vet = comporCotacaoVet(4, 0.05, 0.035); // PTAX 4,00 -> VET 4,34
  const itens = itemizarRecibo(1000, vet, 0.05, 0.035);
  assert.equal(Math.round(itens.ptax * 100) / 100, 4.0);
  assert.equal(itens.subtotal, 4000);
  assert.equal(itens.taxaIntermediacao, 200); // 5% de 4000
  assert.equal(itens.iof, 140); // 3,5% de 4000 (NAO de 4200)
  assert.equal(itens.amortizacaoMoeda, 1000);
  assert.equal(itens.totalBRL, converterParaBRL(1000, vet)); // 4340
});

test("itemizarRecibo respeita percentuais customizados (ex.: IOF alterado)", () => {
  const vet = comporCotacaoVet(5, 0.05, 0.011); // IOF 1,1%
  const itens = itemizarRecibo(200, vet, 0.05, 0.011);
  assert.equal(itens.iofPercentual, 0.011);
  assert.equal(itens.iof, 11); // 1,1% de 1000
  assert.equal(itens.totalBRL, converterParaBRL(200, vet));
});

// --- Câmbio por TENANT (recomposicao da VET a partir da PTAX global) ---

test("extrairComercial e o inverso EXATO de comporCotacaoVet", () => {
  const vet = comporCotacaoVet(4, 0.05, 0.035); // 4,34
  assert.equal(Math.round(extrairComercial(vet, 0.05, 0.035) * 1e6) / 1e6, 4);
});

test("recomporVetTenant: spread/iof iguais aos armazenados -> VET identica (idempotente)", () => {
  const vet = comporCotacaoVet(4.1234, 0.05, 0.035);
  assert.equal(recomporVetTenant(vet, 0.05, 0.035, 0.05, 0.035), vet);
});

test("recomporVetTenant: tenant com spread MAIOR -> VET maior (mesma PTAX)", () => {
  const vetGlobal = comporCotacaoVet(4, 0.05, 0.035); // 4,34
  // Tenant com spread 6,6% (mantendo IOF 3,5%): 4 * (1 + 0.066 + 0.035) = 4.404
  const vetTenant = recomporVetTenant(vetGlobal, 0.05, 0.035, 0.066, 0.035);
  assert.equal(vetTenant, 4.404);
  assert.ok(vetTenant > vetGlobal);
});

test("recomporVetTenant: tenant com spread MENOR -> VET menor (mesma PTAX)", () => {
  const vetGlobal = comporCotacaoVet(4, 0.066, 0.035); // PTAX 4 com spread 6,6%
  // Tenant com spread 5% => 4 * 1.085 = 4.34
  const vetTenant = recomporVetTenant(vetGlobal, 0.066, 0.035, 0.05, 0.035);
  assert.equal(vetTenant, 4.34);
  assert.ok(vetTenant < vetGlobal);
});

test("recomporVetTenant: a conversao resultante bate com a decomposicao do recibo do tenant", () => {
  const vetGlobal = comporCotacaoVet(5, 0.05, 0.035);
  // Tenant spread 8%, IOF 3,5%.
  const vetTenant = recomporVetTenant(vetGlobal, 0.05, 0.035, 0.08, 0.035);
  const itens = itemizarRecibo(1000, vetTenant, 0.08, 0.035);
  // PTAX recuperada volta a ~5,00; subtotal 5000; taxa 8% = 400; iof 3,5% = 175.
  assert.equal(Math.round(itens.ptax * 100) / 100, 5);
  assert.equal(itens.subtotal, 5000);
  assert.equal(itens.taxaIntermediacao, 400);
  assert.equal(itens.iof, 175);
  assert.equal(itens.totalBRL, converterParaBRL(1000, vetTenant));
});
