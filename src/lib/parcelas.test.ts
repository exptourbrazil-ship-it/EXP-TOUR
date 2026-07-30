// Testes dos helpers puros de parcelas.
// Roda com o runner nativo do Node: `npm test` (node --test), sem dependencias.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  somaValoresParcelas,
  somaParcelasConfere,
  valorProgramaAtual,
  TOLERANCIA_SOMA_PARCELAS,
  dataLimiteQuitacao,
  saldoDevedorMoeda,
} from "./parcelas.ts";

test("somaValoresParcelas soma e arredonda para centavos", () => {
  assert.equal(somaValoresParcelas([100, 200.5, 99.5]), 400);
  assert.equal(somaValoresParcelas([0.1, 0.2]), 0.3);
});

test("somaValoresParcelas ignora valores nao numericos como zero", () => {
  assert.equal(somaValoresParcelas([100, NaN as unknown as number]), 100);
});

test("somaParcelasConfere aceita soma igual ao total", () => {
  assert.equal(somaParcelasConfere([1000, 2000, 3000], 6000), true);
});

test("somaParcelasConfere aceita divergencia dentro da tolerancia (centavos)", () => {
  // 33.33 * 3 = 99.99, total 100.00 -> diferenca 0.01, dentro da tolerancia.
  assert.equal(somaParcelasConfere([33.33, 33.33, 33.33], 100), true);
  assert.equal(TOLERANCIA_SOMA_PARCELAS, 0.01);
});

test("somaParcelasConfere rejeita soma menor que o total", () => {
  assert.equal(somaParcelasConfere([1000, 2000], 6000), false);
});

test("somaParcelasConfere rejeita soma maior que o total", () => {
  assert.equal(somaParcelasConfere([1000, 2000, 3001], 6000), false);
});

test("somaParcelasConfere respeita tolerancia customizada", () => {
  assert.equal(somaParcelasConfere([100], 105, 5), true);
  assert.equal(somaParcelasConfere([100], 106, 5), false);
});

test("valorProgramaAtual: retorna o valor_atual (moeda do programa, ja ajustado)", () => {
  // Cliente ajustou de 400 para 500; valor_atual guarda sempre a moeda do
  // programa (o BRL cobrado vive em valor_cobrado_brl, nao aqui).
  assert.equal(valorProgramaAtual({ valor_atual: 500 }), 500);
});

test("valorProgramaAtual: independe de ter Pix gerado (valor_atual sempre e a moeda do programa)", () => {
  // Mesmo com cobranca gerada, valor_atual permanece na moeda do programa.
  assert.equal(valorProgramaAtual({ valor_atual: 500 }), 500);
});

test("valorProgramaAtual: aceita valores em string (vindos do banco)", () => {
  assert.equal(valorProgramaAtual({ valor_atual: "500.00" }), 500);
});

test("dataLimiteQuitacao: 30 dias antes do inicio", () => {
  assert.equal(dataLimiteQuitacao("2026-01-31"), "2026-01-01");
  assert.equal(dataLimiteQuitacao("2026-08-31"), "2026-08-01");
  assert.equal(dataLimiteQuitacao("2026-03-02"), "2026-01-31"); // atravessa fevereiro (2026 nao bissexto)
  assert.equal(dataLimiteQuitacao(null), null);
  assert.equal(dataLimiteQuitacao(""), null);
});

test("saldoDevedorMoeda: soma valor_atual das nao pagas", () => {
  const parcelas = [
    { valor_atual: 100, status: "pago" },
    { valor_atual: 200, status: "pendente" },
    { valor_atual: "300.50", status: "atrasado" },
  ];
  assert.equal(saldoDevedorMoeda(parcelas), 500.5); // 200 + 300,50 (a paga nao entra)
});
