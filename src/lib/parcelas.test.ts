// Testes dos helpers puros de parcelas.
// Roda com o runner nativo do Node: `npm test` (node --test), sem dependencias.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  somaValoresParcelas,
  somaParcelasConfere,
  valorProgramaAtual,
  TOLERANCIA_SOMA_PARCELAS,
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

test("valorProgramaAtual: parcela pendente usa o valor_atual (ajustado)", () => {
  // Cliente ajustou de 400 para 500; ainda nao gerou Pix -> vale o ajuste.
  assert.equal(
    valorProgramaAtual({ valor_original: 400, valor_atual: 500, status: "pendente", qr_code_url: null }),
    500
  );
});

test("valorProgramaAtual: parcela sem ajuste retorna o mesmo valor", () => {
  assert.equal(
    valorProgramaAtual({ valor_original: 400, valor_atual: 400, status: "pendente", qr_code_url: null }),
    400
  );
});

test("valorProgramaAtual: com Pix gerado usa valor_original (valor_atual virou BRL)", () => {
  // Apos gerar-cobranca, valor_atual guarda o BRL cobrado; a divida na moeda
  // do programa continua sendo o valor_original.
  assert.equal(
    valorProgramaAtual({ valor_original: 400, valor_atual: 1595.3, status: "pendente", qr_code_url: "data:image/png;base64,xxx" }),
    400
  );
});

test("valorProgramaAtual: parcela paga usa valor_original", () => {
  assert.equal(
    valorProgramaAtual({ valor_original: 400, valor_atual: 1595.3, status: "pago", qr_code_url: null }),
    400
  );
});

test("valorProgramaAtual: aceita valores em string (vindos do banco)", () => {
  assert.equal(
    valorProgramaAtual({ valor_original: "400.00", valor_atual: "500.00", status: "pendente", qr_code_url: null }),
    500
  );
});
