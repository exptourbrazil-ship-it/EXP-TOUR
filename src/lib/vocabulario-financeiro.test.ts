import { test } from "node:test";
import assert from "node:assert/strict";
import { descricaoPagamento } from "./vocabulario-financeiro.ts";

test("descricaoPagamento converte 'Parcela N/M' em 'Pagamento N de M'", () => {
  assert.equal(descricaoPagamento("Parcela 1/12"), "Pagamento 1 de 12");
  assert.equal(descricaoPagamento("Parcela 3/3"), "Pagamento 3 de 3");
  assert.equal(descricaoPagamento("parcela 10 / 24"), "Pagamento 10 de 24");
});

test("descricaoPagamento converte 'Parcela N' e 'Parcela' isolada", () => {
  assert.equal(descricaoPagamento("Parcela 2"), "Pagamento 2");
  assert.equal(descricaoPagamento("Parcela"), "Pagamento");
});

test("descricaoPagamento passa adiante outros textos", () => {
  assert.equal(descricaoPagamento("Entrada"), "Entrada");
  assert.equal(descricaoPagamento("Pagamento 1 de 12"), "Pagamento 1 de 12");
});

test("descricaoPagamento trata vazio/nulo", () => {
  assert.equal(descricaoPagamento(""), "Pagamento");
  assert.equal(descricaoPagamento(null), "Pagamento");
  assert.equal(descricaoPagamento(undefined), "Pagamento");
});
