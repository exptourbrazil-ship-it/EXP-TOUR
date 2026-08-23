// Testes do motor de alteracao (puro) — previa do plano no adiamento (E2).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calcularPlanoDeferral,
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
