import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calcularMoraSaldo,
  estagioMora,
  MORA_SUSPENSAO_DIAS,
  MORA_RESOLUCAO_DIAS,
  type MoraInput,
} from "./mora.ts";

function base(): MoraInput {
  return { saldoMoeda: 10000, diasAtraso: 45 }; // defaults: multa 2%, juros 1%/mes, indice 0
}

// M1 — multa unica + juros pro-rata (45 dias = 1,5 mes).
test("M1 encargos multa + juros pro-rata", () => {
  const r = calcularMoraSaldo(base());
  assert.equal(r.aplicavel, true);
  assert.equal(r.multa, 200); // 2% de 10000
  assert.equal(r.juros, 150); // 1% x (45/30) x 10000 = 1,5% = 150
  assert.equal(r.indice, 0);
  assert.equal(r.encargos, 350);
  assert.equal(r.saldoComEncargos, 10350);
});

// M2 — em dia (atraso <= 0): sem encargos.
test("M2 em dia", () => {
  const r = calcularMoraSaldo({ saldoMoeda: 10000, diasAtraso: 0 });
  assert.equal(r.aplicavel, false);
  assert.equal(r.encargos, 0);
  assert.equal(r.saldoComEncargos, 10000);
  assert.equal(r.estagio, "em_dia");
});

// M3 — saldo zero: sem encargos mesmo em atraso.
test("M3 saldo zero", () => {
  const r = calcularMoraSaldo({ saldoMoeda: 0, diasAtraso: 60 });
  assert.equal(r.aplicavel, false);
  assert.equal(r.encargos, 0);
});

// M4 — estagios pelos gatilhos 15/30.
test("M4 estagios", () => {
  assert.equal(estagioMora(0), "em_dia");
  assert.equal(estagioMora(1), "mora");
  assert.equal(estagioMora(14), "mora");
  assert.equal(estagioMora(15), "suspensao");
  assert.equal(estagioMora(29), "suspensao");
  assert.equal(estagioMora(30), "resolucao");
  assert.equal(estagioMora(90), "resolucao");
  assert.equal(MORA_SUSPENSAO_DIAS, 15);
  assert.equal(MORA_RESOLUCAO_DIAS, 30);
});

// M5 — indice de correcao quando configurado entra nos encargos.
test("M5 indice configurado", () => {
  const r = calcularMoraSaldo({ saldoMoeda: 10000, diasAtraso: 30, indicePercent: 0.005 });
  assert.equal(r.indice, 50); // 0,5% de 10000
  assert.equal(r.multa, 200);
  assert.equal(r.juros, 100); // 1% x (30/30)
  assert.equal(r.encargos, 350);
});

// M6 — percentuais por config (override) tem precedencia.
test("M6 config override", () => {
  const r = calcularMoraSaldo({ saldoMoeda: 10000, diasAtraso: 30, multaPercent: 0.05, jurosMesPercent: 0.02 });
  assert.equal(r.multa, 500); // 5%
  assert.equal(r.juros, 200); // 2% x 1 mes
});

// M7 — memoria fecha no saldo com encargos; em dia so tem o saldo.
test("M7 memoria", () => {
  const r = calcularMoraSaldo(base());
  assert.equal(r.memoria[r.memoria.length - 1].rotulo, "Saldo com encargos");
  assert.equal(r.memoria[r.memoria.length - 1].valor, 10350);
  const emDia = calcularMoraSaldo({ saldoMoeda: 5000, diasAtraso: -3 });
  assert.equal(emDia.memoria.length, 1);
});

// M8 — gatilhos configuraveis.
test("M8 gatilhos configuraveis", () => {
  assert.equal(estagioMora(10, { suspensaoDias: 7, resolucaoDias: 20 }), "suspensao");
  assert.equal(estagioMora(20, { suspensaoDias: 7, resolucaoDias: 20 }), "resolucao");
});
