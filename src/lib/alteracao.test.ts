// Testes do motor de alteracao (puro) — previa do plano no adiamento (E2).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calcularPlanoDeferral,
  calcularAlteracaoEscopo,
  somaValoresParcelas,
  dataLimiteQuitacao,
} from "./parcelas.ts";

test("nova data-limite de quitacao = D-30 do novo inicio", () => {
  const p = calcularPlanoDeferral({
    saldoDevedor: 9000,
    dataReferencia: "2026-01-01",
    novaDataInicio: "2026-12-01",
  });
  assert.equal(p.novaDataQuitacao, dataLimiteQuitacao("2026-12-01"));
});

test("reagenda o saldo em parcelas mensais dentro da nova janela; soma bate", () => {
  const p = calcularPlanoDeferral({
    saldoDevedor: 9000,
    dataReferencia: "2026-01-01",
    novaDataInicio: "2026-12-01", // janela larga -> varias parcelas
  });
  assert.ok(p.planoProposto.length >= 2, "esperava varias parcelas na janela larga");
  assert.equal(p.cabe, true);
  // numeros sequenciais, vencimentos crescentes
  p.planoProposto.forEach((x, i) => assert.equal(x.numero, i + 1));
  for (let i = 1; i < p.planoProposto.length; i++) {
    assert.ok(p.planoProposto[i].vencimento > p.planoProposto[i - 1].vencimento);
  }
  // a soma das parcelas propostas bate com o saldo (centavos)
  assert.equal(somaValoresParcelas(p.planoProposto.map((x) => x.valor)), 9000);
});

test("saldo zero -> plano vazio (nada a reagendar)", () => {
  const p = calcularPlanoDeferral({
    saldoDevedor: 0,
    dataReferencia: "2026-01-01",
    novaDataInicio: "2026-12-01",
  });
  assert.deepEqual(p.planoProposto, []);
  assert.equal(p.cabe, true);
});

test("janela curta (sem dia-15 disponivel) -> parcela unica na data de quitacao", () => {
  // novaDataInicio proxima da referencia: nao cabe parcela mensal antes de D-30.
  const p = calcularPlanoDeferral({
    saldoDevedor: 5000,
    dataReferencia: "2026-01-01",
    novaDataInicio: "2026-01-20",
  });
  assert.equal(p.planoProposto.length, 1);
  assert.equal(p.planoProposto[0].valor, 5000);
  assert.equal(p.planoProposto[0].vencimento, dataLimiteQuitacao("2026-01-20"));
  assert.equal(p.cabe, true);
});

// ---- E3: alteracao de escopo (delta nos dois sentidos) ---------------------

test("E3 aditivo: delta positivo reagenda (novo total - ja pago); soma bate", () => {
  const r = calcularAlteracaoEscopo({
    valorProgramaAtual: 10000,
    valorProgramaNovo: 13000, // upgrade/extensao
    jaPago: 4000,
    dataReferencia: "2026-01-01",
    dataInicio: "2026-12-01",
  });
  assert.equal(r.sentido, "aditivo");
  assert.equal(r.delta, 3000);
  assert.equal(r.novoSaldo, 9000); // 13000 - 4000
  assert.equal(r.creditoCliente, 0);
  assert.equal(r.novaDataQuitacao, dataLimiteQuitacao("2026-12-01"));
  assert.equal(somaValoresParcelas(r.planoProposto.map((x) => x.valor)), 9000);
});

test("E3 credito com refund: ja pago supera o novo total -> credito ao cliente, saldo zero", () => {
  const r = calcularAlteracaoEscopo({
    valorProgramaAtual: 10000,
    valorProgramaNovo: 6000, // downgrade forte
    jaPago: 8000,
    dataReferencia: "2026-01-01",
    dataInicio: "2026-12-01",
  });
  assert.equal(r.sentido, "credito");
  assert.equal(r.delta, -4000);
  assert.equal(r.novoSaldo, 0); // 6000 - 8000 < 0
  assert.equal(r.creditoCliente, 2000); // 8000 - 6000
  assert.deepEqual(r.planoProposto, []);
});

test("E3 credito sem refund: downgrade com saldo ainda positivo reagenda o restante", () => {
  const r = calcularAlteracaoEscopo({
    valorProgramaAtual: 10000,
    valorProgramaNovo: 8000,
    jaPago: 3000,
    dataReferencia: "2026-01-01",
    dataInicio: "2026-12-01",
  });
  assert.equal(r.sentido, "credito");
  assert.equal(r.delta, -2000);
  assert.equal(r.novoSaldo, 5000); // 8000 - 3000
  assert.equal(r.creditoCliente, 0);
  assert.equal(somaValoresParcelas(r.planoProposto.map((x) => x.valor)), 5000);
});

test("E3 neutro: delta zero apenas reagenda o saldo restante", () => {
  const r = calcularAlteracaoEscopo({
    valorProgramaAtual: 10000,
    valorProgramaNovo: 10000,
    jaPago: 2500,
    dataReferencia: "2026-01-01",
    dataInicio: "2026-12-01",
  });
  assert.equal(r.sentido, "neutro");
  assert.equal(r.delta, 0);
  assert.equal(r.novoSaldo, 7500);
  assert.equal(r.creditoCliente, 0);
  assert.equal(somaValoresParcelas(r.planoProposto.map((x) => x.valor)), 7500);
});
