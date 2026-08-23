// Testes do motor de acerto (puro). Casos de retencao por faixa, tipo sem multa,
// cap no saldo e memoria de calculo.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RETENCAO_PLACEHOLDER,
  determinarRetencaoPercentual,
  calcularAcerto,
} from "./acerto.ts";

test("determinarRetencaoPercentual: faixas placeholder por dias ate inicio", () => {
  assert.equal(determinarRetencaoPercentual("cancelamento_cliente", 90), 0.1); // >=60
  assert.equal(determinarRetencaoPercentual("cancelamento_cliente", 60), 0.1);
  assert.equal(determinarRetencaoPercentual("cancelamento_cliente", 45), 0.25); // 30-59
  assert.equal(determinarRetencaoPercentual("cancelamento_cliente", 30), 0.25);
  assert.equal(determinarRetencaoPercentual("cancelamento_cliente", 10), 0.5); // 0-29
  assert.equal(determinarRetencaoPercentual("cancelamento_cliente", 0), 0.5);
});

test("determinarRetencaoPercentual: ja iniciado (negativo) usa a faixa mais alta", () => {
  assert.equal(determinarRetencaoPercentual("interrupcao_programa", -5), 0.5);
  assert.equal(determinarRetencaoPercentual("cancelamento_inadimplencia", -100), 0.5);
});

test("determinarRetencaoPercentual: escola cancela -> sem retencao (culpa nao e do cliente)", () => {
  assert.equal(determinarRetencaoPercentual("cancelamento_escola", 5), 0);
  assert.equal(determinarRetencaoPercentual("cancelamento_escola", 90), 0);
});

test("calcularAcerto: retencao sobre o valor total; saldo = pago - retencao", () => {
  const a = calcularAcerto({ valorTotal: 10000, totalPago: 6000, retencaoPercentual: 0.25 });
  assert.equal(a.retencaoValor, 2500); // 25% de 10000
  assert.equal(a.saldoDevolverCliente, 3500); // 6000 - 2500
  assert.equal(a.retencaoPercentual, 0.25);
  // memoria com as linhas esperadas
  const rotulos = a.memoria.map((l) => l.rotulo);
  assert.ok(rotulos.some((r) => r.startsWith("Retenção contratual")));
  assert.ok(rotulos.includes("Saldo a devolver ao cliente"));
});

test("calcularAcerto: retencao maior que o pago -> saldo nunca negativo", () => {
  const a = calcularAcerto({ valorTotal: 10000, totalPago: 1000, retencaoPercentual: 0.5 });
  assert.equal(a.retencaoValor, 5000);
  assert.equal(a.saldoDevolverCliente, 0); // max(0, 1000 - 5000)
});

test("calcularAcerto: sem retencao (escola) -> devolve tudo o que pagou", () => {
  const pct = determinarRetencaoPercentual("cancelamento_escola", 20);
  const a = calcularAcerto({ valorTotal: 10000, totalPago: 4500, retencaoPercentual: pct });
  assert.equal(a.retencaoValor, 0);
  assert.equal(a.saldoDevolverCliente, 4500);
});

test("calcularAcerto: refund da escola e informacional, nao entra no saldo do cliente", () => {
  const a = calcularAcerto({
    valorTotal: 10000,
    totalPago: 6000,
    retencaoPercentual: 0.25,
    refundEscolaEsperado: 3000,
  });
  assert.equal(a.refundEscolaEsperado, 3000);
  assert.equal(a.saldoDevolverCliente, 3500); // inalterado pelo refund da escola
  assert.ok(a.memoria.some((l) => l.rotulo.includes("Refund esperado da escola")));
});

test("calcularAcerto: arredonda a 2 casas e limita percentual a [0,1]", () => {
  const a = calcularAcerto({ valorTotal: 999.999, totalPago: 500.005, retencaoPercentual: 1.5 });
  assert.equal(a.retencaoPercentual, 1); // limitado a 1
  assert.equal(a.retencaoValor, 1000); // 100% de 1000 (arredondado)
  assert.equal(a.saldoDevolverCliente, 0);
});

test("faixas placeholder estao ordenadas/coerentes", () => {
  assert.equal(RETENCAO_PLACEHOLDER.length, 3);
  for (const f of RETENCAO_PLACEHOLDER) {
    assert.ok(f.percentual >= 0 && f.percentual <= 1);
    assert.ok(f.minDiasAteInicio >= 0);
  }
});
