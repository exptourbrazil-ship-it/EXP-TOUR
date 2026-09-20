import { test } from "node:test";
import assert from "node:assert/strict";
import { entradaDaOpcao } from "./entrada-cotacao.ts";

const matricula = { amount: 95, currency: "GBP", isRefundable: false, basis: "once_per_item" };
const colocacao = { amount: 60, currency: "GBP", isRefundable: null, basis: "once_per_item" };
const material = { amount: 12, currency: "GBP", isRefundable: null, basis: "per_unit" };

test("soma as taxas cobradas uma vez", () => {
  assert.equal(entradaDaOpcao({ moeda: "GBP", deposit: null, depositCurrency: null, taxas: [matricula, colocacao] }), 155);
});

test("taxa per_unit (material por semana) NAO entra: e recorrente, nao entrada", () => {
  assert.equal(entradaDaOpcao({ moeda: "GBP", deposit: null, depositCurrency: null, taxas: [matricula, material] }), 95);
});

test("is_refundable nulo conta como NAO reembolsavel", () => {
  assert.equal(entradaDaOpcao({ moeda: "GBP", deposit: null, depositCurrency: null, taxas: [colocacao] }), 60);
});

test("taxa explicitamente reembolsavel fica de fora", () => {
  const caucao = { amount: 300, currency: "GBP", isRefundable: true, basis: "once_per_item" };
  assert.equal(entradaDaOpcao({ moeda: "GBP", deposit: null, depositCurrency: null, taxas: [matricula, caucao] }), 95);
});

test("once_per_quote tambem e pagamento unico e entra", () => {
  const banco = { amount: 40, currency: "GBP", isRefundable: false, basis: "once_per_quote" };
  assert.equal(entradaDaOpcao({ moeda: "GBP", deposit: null, depositCurrency: null, taxas: [matricula, banco] }), 135);
});

test("basis desconhecida ou ausente nao entra (nao da para afirmar que e unica)", () => {
  assert.equal(entradaDaOpcao({ moeda: "GBP", deposit: null, depositCurrency: null, taxas: [{ amount: 50, currency: "GBP", isRefundable: false, basis: null }] }), 0);
  assert.equal(entradaDaOpcao({ moeda: "GBP", deposit: null, depositCurrency: null, taxas: [{ amount: 50, currency: "GBP", isRefundable: false, basis: "mensal" }] }), 0);
});

test("deposito definido pelo consultor vence o calculo", () => {
  assert.equal(entradaDaOpcao({ moeda: "GBP", deposit: 500, depositCurrency: "GBP", taxas: [matricula, colocacao] }), 500);
});

test("deposito ZERO e uma decisao valida: sem entrada", () => {
  assert.equal(entradaDaOpcao({ moeda: "GBP", deposit: 0, depositCurrency: "GBP", taxas: [matricula, colocacao] }), 0);
});

test("valor negativo nunca vira entrada", () => {
  assert.equal(entradaDaOpcao({ moeda: "GBP", deposit: -10, depositCurrency: "GBP", taxas: [] }), 0);
  assert.equal(entradaDaOpcao({ moeda: "GBP", deposit: null, depositCurrency: null, taxas: [{ amount: -10, currency: "GBP", isRefundable: false, basis: "once_per_item" }] }), 0);
});

test("sem taxas e sem deposito, entrada e zero", () => {
  assert.equal(entradaDaOpcao({ moeda: "GBP", deposit: null, depositCurrency: null, taxas: [] }), 0);
});

test("per_person e cobranca unica e entra na entrada", () => {
  const visto = { amount: 80, currency: "GBP", isRefundable: false, basis: "per_person" };
  assert.equal(entradaDaOpcao({ moeda: "GBP", deposit: null, depositCurrency: null, taxas: [visto] }), 80);
});

test("taxa em OUTRA moeda nao entra: somaria libra com real", () => {
  const emReal = { amount: 500, currency: "BRL", isRefundable: false, basis: "once_per_item" };
  assert.equal(entradaDaOpcao({ moeda: "GBP", deposit: null, depositCurrency: null, taxas: [matricula, emReal] }), 95);
});

test("deposito em outra moeda e ignorado e cai no calculo por taxas", () => {
  assert.equal(
    entradaDaOpcao({ moeda: "GBP", deposit: 1500, depositCurrency: "BRL", taxas: [matricula, colocacao] }),
    155,
  );
});
