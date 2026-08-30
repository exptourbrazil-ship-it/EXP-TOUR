import { test } from "node:test";
import assert from "node:assert/strict";
import { montarExtratoSaldo, diasEntre, marcoDe, type ExtratoInput } from "./extrato-saldo.ts";

function base(): ExtratoInput {
  return {
    moeda: "CAD",
    valorTotal: 10000,
    dataAbertura: "2026-06-15",
    dataLimiteQuitacao: "2026-09-01",
    hojeISO: "2026-08-20",
    cotacaoHoje: 4.34,
    saldoAtualMoeda: 6000,
    pagamentos: [
      { data: "2026-07-05", descricao: "Entrada", amortizacaoMoeda: 2000, cotacao: 4.30, valorBRL: 8600 },
      { data: "2026-08-05", descricao: "Parcela 1", amortizacaoMoeda: 2000, cotacao: 4.32, valorBRL: 8640 },
    ],
  };
}

// E1 — abertura + movimentos com saldo corrente decrescente.
test("E1 saldo corrente por movimento", () => {
  const e = montarExtratoSaldo(base());
  assert.equal(e.movimentos.length, 3);
  assert.equal(e.movimentos[0].tipo, "contratacao");
  assert.equal(e.movimentos[0].saldoAposMoeda, 10000);
  assert.equal(e.movimentos[1].saldoAposMoeda, 8000);
  assert.equal(e.movimentos[2].saldoAposMoeda, 6000);
  assert.equal(e.movimentos[1].cotacao, 4.3);
});

// E2 — resumo: saldo autoritativo + quitar hoje pela cotacao do dia.
test("E2 resumo saldo e quitar hoje", () => {
  const e = montarExtratoSaldo(base());
  assert.equal(e.resumo.saldoMoeda, 6000);
  assert.equal(e.resumo.quitado, false);
  assert.equal(e.resumo.quitarHojeBRL, round2(6000 * 4.34));
});
function round2(n: number) { return Math.round(n * 100) / 100; }

// E3 — marcos: dias restantes ate a data-limite mapeiam D-30/D-15/D-5.
test("E3 marcos de quitacao", () => {
  assert.equal(marcoDe(40), null);
  assert.equal(marcoDe(30), "D-30");
  assert.equal(marcoDe(20), "D-30");
  assert.equal(marcoDe(15), "D-15");
  assert.equal(marcoDe(6), "D-15");
  assert.equal(marcoDe(5), "D-5");
  assert.equal(marcoDe(0), "D-5");
  assert.equal(marcoDe(-1), "vencido");
  assert.equal(marcoDe(null), null);
});

// E4 — diasRestantes e marco no resumo (12 dias -> D-15).
test("E4 dias restantes no resumo", () => {
  const e = montarExtratoSaldo(base()); // hoje 20/08, limite 01/09 -> 12 dias
  assert.equal(e.resumo.diasRestantes, 12);
  assert.equal(e.resumo.marco, "D-15");
});

// E5 — quitado: saldo 0 zera quitar hoje e suprime marco.
test("E5 quitado", () => {
  const i = base();
  i.saldoAtualMoeda = 0;
  const e = montarExtratoSaldo(i);
  assert.equal(e.resumo.quitado, true);
  assert.equal(e.resumo.quitarHojeBRL, 0);
  assert.equal(e.resumo.marco, null);
  assert.equal(e.resumo.diasRestantes, null);
});

// E6 — sem cotacao do dia: quitar hoje indisponivel (null).
test("E6 sem cotacao do dia", () => {
  const i = base();
  i.cotacaoHoje = null;
  const e = montarExtratoSaldo(i);
  assert.equal(e.resumo.quitarHojeBRL, null);
});

// E7 — saldo corrente nao fica negativo (amortizacao alem do saldo).
test("E7 saldo corrente clampa em 0", () => {
  const i = base();
  i.valorTotal = 3000;
  i.pagamentos = [{ data: "2026-07-05", descricao: "Entrada", amortizacaoMoeda: 5000, cotacao: 4.3, valorBRL: null }];
  const e = montarExtratoSaldo(i);
  assert.equal(e.movimentos[1].saldoAposMoeda, 0);
});

// E7b — saldo congelado (autoritativo) tem precedencia sobre o derivado.
test("E7b saldo congelado vence o derivado", () => {
  const i = base();
  // Antecipacao com desconto: paga 2000 mas o saldo autoritativo caiu para 5500.
  i.pagamentos = [{ data: "2026-07-05", descricao: "Entrada", amortizacaoMoeda: 2000, cotacao: 4.3, valorBRL: 8600, saldoFrozen: 5500 }];
  const e = montarExtratoSaldo(i);
  assert.equal(e.movimentos[1].saldoAposMoeda, 5500); // usa o congelado, nao 10000-2000
});

// E8 — abertura datada na dataAbertura (contratacao), antes dos pagamentos.
test("E8b abertura antes dos pagamentos", () => {
  const e = montarExtratoSaldo(base());
  assert.equal(e.movimentos[0].data, "2026-06-15");
  assert.ok(e.movimentos[0].data < e.movimentos[1].data);
});

// E8 — sem pagamentos: so a abertura, saldo = valorTotal.
test("E8 sem pagamentos", () => {
  const i = base();
  i.pagamentos = [];
  i.saldoAtualMoeda = 10000;
  const e = montarExtratoSaldo(i);
  assert.equal(e.movimentos.length, 1);
  assert.equal(e.movimentos[0].saldoAposMoeda, 10000);
});

// E9 — diasEntre em UTC.
test("E9 diasEntre", () => {
  assert.equal(diasEntre("2026-08-20", "2026-09-01"), 12);
  assert.equal(diasEntre("2026-09-01", "2026-08-20"), -12);
  assert.equal(diasEntre("x", "2026-01-01"), null);
});
