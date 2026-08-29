import { test } from "node:test";
import assert from "node:assert/strict";
import { montarPlanoConversao } from "./parcelas.ts";

// Janela ampla o suficiente para varias mensais (compra ago/2026, inicio jun/2027).
const COMPRA = "2026-08-29";
const INICIO_AMPLO = "2027-06-01";

test("C1 janela ampla + entrada: entrada + mensais, soma bate", () => {
  const p = montarPlanoConversao({ liquido: 12000, entrada: 3000, dataCompraISO: COMPRA, dataInicioISO: INICIO_AMPLO });
  assert.equal(p.ok, true);
  assert.equal(p.parcelas[0].is_entrada, true);
  assert.equal(p.parcelas[0].valor, 3000);
  assert.equal(p.parcelas[0].vencimento, COMPRA);
  // Ha ao menos uma mensal alem da entrada.
  assert.ok(p.parcelas.length >= 2);
  assert.equal(p.parcelas.filter((x) => x.is_entrada).length, 1);
  assert.equal(p.total, 12000);
});

test("C2 sem data de inicio: tudo vira entrada (sem mensais)", () => {
  const p = montarPlanoConversao({ liquido: 5000, entrada: 1000, dataCompraISO: COMPRA, dataInicioISO: null });
  assert.equal(p.ok, true);
  assert.equal(p.parcelas.length, 1);
  assert.equal(p.parcelas[0].is_entrada, true);
  assert.equal(p.parcelas[0].valor, 5000);
});

test("C3 entrada zero com janela: sem parcela de entrada, so mensais", () => {
  const p = montarPlanoConversao({ liquido: 9000, entrada: 0, dataCompraISO: COMPRA, dataInicioISO: INICIO_AMPLO });
  assert.equal(p.ok, true);
  assert.equal(p.parcelas.filter((x) => x.is_entrada).length, 0);
  assert.equal(p.parcelas[0].is_entrada, false);
  assert.equal(p.total, 9000);
});

test("C4 entrada maior que o total: limita a entrada ao total", () => {
  const p = montarPlanoConversao({ liquido: 2000, entrada: 5000, dataCompraISO: COMPRA, dataInicioISO: INICIO_AMPLO });
  assert.equal(p.ok, true);
  assert.equal(p.parcelas[0].valor, 2000); // entrada limitada
  assert.equal(p.total, 2000);
});

test("C5 janela curta (inicio proximo): sem mensais, so entrada = total", () => {
  // Inicio em ~22 dias: D-30 cai antes da compra -> nenhuma mensal cabe.
  const p = montarPlanoConversao({ liquido: 4000, entrada: 800, dataCompraISO: COMPRA, dataInicioISO: "2026-09-20" });
  assert.equal(p.ok, true);
  assert.equal(p.parcelas.length, 1);
  assert.equal(p.parcelas[0].is_entrada, true);
  assert.equal(p.parcelas[0].valor, 4000);
});

test("C6 soma fecha mesmo com valor quebrado", () => {
  const p = montarPlanoConversao({ liquido: 10000.03, entrada: 1000, dataCompraISO: COMPRA, dataInicioISO: INICIO_AMPLO });
  assert.equal(p.ok, true);
  assert.equal(p.total, 10000.03);
  // numeracao sequencial sem buracos
  p.parcelas.forEach((x, i) => assert.equal(x.numero, i + 1));
});

test("C7 valor invalido (<=0) nao gera plano", () => {
  const p = montarPlanoConversao({ liquido: 0, entrada: 0, dataCompraISO: COMPRA, dataInicioISO: INICIO_AMPLO });
  assert.equal(p.ok, false);
  assert.equal(p.motivo, "valor_invalido");
  assert.equal(p.parcelas.length, 0);
});
