// Testes do helper puro do ledger de pagamentos.
// Roda com o runner nativo do Node: `npm test` (node --test), sem dependencias.
import { test } from "node:test";
import assert from "node:assert/strict";
import { montarLancamentoPagamento } from "./pagamento-ledger.ts";

const base = {
  paymentId: "MP-123",
  pagoEm: "2026-07-27T12:00:00.000Z",
};

test("usa o transaction_amount do MP como BRL efetivamente pago", () => {
  const l = montarLancamentoPagamento({
    ...base,
    moeda: "CAD",
    parcela: {
      id: "p1",
      contrato_id: "c1",
      valor_original: "1000", // CAD
      valor_atual: "3990.00", // BRL cobrado na geracao
      cotacao_aplicada: "3.99",
    },
    pagamentoMP: { status: "approved", transaction_amount: 4010.5 }, // pago um pouco diferente
  });
  assert.deepEqual(l, {
    parcela_id: "p1",
    contrato_id: "c1",
    external_payment_id: "MP-123",
    moeda: "CAD",
    valor_programa: 1000,
    cotacao_aplicada: 3.99,
    valor_brl: 4010.5, // veio do MP, nao do valor_atual
    pago_em: "2026-07-27T12:00:00.000Z",
  });
});

test("cai para valor_atual (BRL cobrado) quando o MP nao traz transaction_amount", () => {
  const l = montarLancamentoPagamento({
    ...base,
    moeda: "USD",
    parcela: {
      id: "p2",
      contrato_id: "c1",
      valor_original: "500",
      valor_atual: "2750.00",
      cotacao_aplicada: "5.5",
    },
    pagamentoMP: { status: "approved" },
  });
  assert.equal(l.valor_brl, 2750);
  assert.equal(l.cotacao_aplicada, 5.5);
  assert.equal(l.valor_programa, 500);
});

test("reconstroi pela formula quando nao ha MP nem valor_atual", () => {
  const l = montarLancamentoPagamento({
    ...base,
    moeda: "CAD",
    parcela: {
      id: "p3",
      contrato_id: "c1",
      valor_original: "100",
      valor_atual: null,
      cotacao_aplicada: "4.005",
    },
    pagamentoMP: {},
  });
  assert.equal(l.valor_brl, 400.5); // 100 * 4.005, arredondado a centavos
});

test("contrato em BRL: sem cotacao, BRL = valor do programa", () => {
  const l = montarLancamentoPagamento({
    ...base,
    moeda: "BRL",
    parcela: {
      id: "p4",
      contrato_id: "c1",
      valor_original: "1500.00",
      valor_atual: null,
      cotacao_aplicada: null,
    },
    pagamentoMP: {},
  });
  assert.equal(l.moeda, "BRL");
  assert.equal(l.cotacao_aplicada, null);
  assert.equal(l.valor_brl, 1500);
  assert.equal(l.valor_programa, 1500);
});
