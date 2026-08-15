import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calcularVencimentosParcelas,
  dividirValorParcelas,
  dataLimiteQuitacao,
  somaParcelasConfere,
  DIAS_ATE_PRIMEIRA_PARCELA,
} from "./parcelas.ts";

// ---------------------------------------------------------------------------
// calcularVencimentosParcelas
// ---------------------------------------------------------------------------

test("primeira parcela respeita a carencia de 30 dias apos a compra", () => {
  // Compra em 15/01. Carencia -> 14/02. O dia 15 de fevereiro ja serve.
  const v = calcularVencimentosParcelas("2026-01-15", "2027-01-15");
  assert.equal(v[0], "2026-02-15");
});

test("pula o dia 15 que cai dentro da carencia", () => {
  // Compra em 20/01. Carencia -> 19/02. O 15/02 NAO serve; vai para 15/03.
  const v = calcularVencimentosParcelas("2026-01-20", "2027-01-15");
  assert.equal(v[0], "2026-03-15");
});

test("ultima parcela nunca ultrapassa o limite dos 30 dias", () => {
  const dataInicio = "2027-01-15";
  const limite = dataLimiteQuitacao(dataInicio)!; // 2026-12-16
  const v = calcularVencimentosParcelas("2026-01-15", dataInicio);
  assert.ok(v[v.length - 1] <= limite, `ultima ${v[v.length - 1]} > limite ${limite}`);
  // 15/12 cabe (<= 16/12); 15/01/2027 nao.
  assert.equal(v[v.length - 1], "2026-12-15");
});

test("todas as parcelas caem no dia 15", () => {
  const v = calcularVencimentosParcelas("2026-01-15", "2027-06-01");
  assert.ok(v.length > 0);
  for (const d of v) assert.equal(d.slice(8, 10), "15");
});

test("vencimentos sao estritamente crescentes e viram o ano corretamente", () => {
  const v = calcularVencimentosParcelas("2026-08-15", "2028-01-10");
  for (let i = 1; i < v.length; i++) {
    assert.ok(v[i] > v[i - 1], `${v[i]} deveria ser maior que ${v[i - 1]}`);
  }
  assert.ok(v.includes("2026-12-15"));
  assert.ok(v.includes("2027-01-15"));
});

test("janela curta gera zero parcelas (contrato so com entrada)", () => {
  // Inicio em 40 dias: limite = compra + 10 dias, antes da carencia de 30.
  const v = calcularVencimentosParcelas("2026-08-15", "2026-09-24");
  assert.deepEqual(v, []);
});

test("janela que comporta exatamente uma parcela gera uma", () => {
  // Compra 01/08. Carencia -> 31/08, entao 15/09 e a primeira elegivel.
  // Inicio 20/10 -> limite 20/09. Cabe 15/09 e mais nenhuma.
  const v = calcularVencimentosParcelas("2026-08-01", "2026-10-20");
  assert.deepEqual(v, ["2026-09-15"]);
});

test("sem data de inicio retorna vazio", () => {
  assert.deepEqual(calcularVencimentosParcelas("2026-08-15", null), []);
  assert.deepEqual(calcularVencimentosParcelas("2026-08-15", undefined), []);
  assert.deepEqual(calcularVencimentosParcelas("2026-08-15", ""), []);
});

test("a carencia configurada e de fato 30 dias", () => {
  assert.equal(DIAS_ATE_PRIMEIRA_PARCELA, 30);
});

// ---------------------------------------------------------------------------
// dividirValorParcelas
// ---------------------------------------------------------------------------

test("divisao exata distribui valores iguais", () => {
  assert.deepEqual(dividirValorParcelas(300, 3), [100, 100, 100]);
});

test("sobra de centavos vai para a ultima parcela", () => {
  const v = dividirValorParcelas(100, 3);
  assert.deepEqual(v, [33.33, 33.33, 33.34]);
});

test("soma das parcelas bate exatamente com o total", () => {
  for (const total of [100, 1000.01, 9999.99, 12345.67, 7.77]) {
    for (const n of [1, 2, 3, 7, 12, 18, 24]) {
      const v = dividirValorParcelas(total, n);
      assert.ok(
        somaParcelasConfere(v, total),
        `total ${total} em ${n}x nao fecha: soma ${v.reduce((a, b) => a + b, 0)}`
      );
    }
  }
});

test("quantidade zero ou negativa retorna vazio", () => {
  assert.deepEqual(dividirValorParcelas(500, 0), []);
  assert.deepEqual(dividirValorParcelas(500, -3), []);
});

test("valor zero gera parcelas zeradas sem NaN", () => {
  assert.deepEqual(dividirValorParcelas(0, 3), [0, 0, 0]);
});

// ---------------------------------------------------------------------------
// Integracao das duas regras
// ---------------------------------------------------------------------------

test("plano completo: entrada + parcelas somam o valor total do contrato", () => {
  const valorTotal = 25000;
  const valorEntrada = 5000;
  const vencimentos = calcularVencimentosParcelas("2026-08-15", "2027-08-01");
  const valores = dividirValorParcelas(valorTotal - valorEntrada, vencimentos.length);

  assert.ok(vencimentos.length > 0);
  assert.ok(somaParcelasConfere([valorEntrada, ...valores], valorTotal));
});
