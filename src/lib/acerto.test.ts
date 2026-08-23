// Testes do motor de acerto (puro). Casos de retencao por faixa, tipo sem multa,
// cap no saldo e memoria de calculo.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RETENCAO_PLACEHOLDER,
  determinarRetencaoPercentual,
  calcularAcerto,
  calcularAcertoCreditoEscopo,
  validarFaixasRetencao,
  transicaoAcertoPermitida,
  renderizarTermoAcerto,
  planejarRefund,
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

test("calcularAcertoCreditoEscopo: credito = pago - novo valor (sem retencao)", () => {
  const a = calcularAcertoCreditoEscopo({ valorProgramaNovo: 6000, jaPago: 8000 });
  assert.equal(a.creditoDevolver, 2000);
  assert.equal(a.valorProgramaNovo, 6000);
  assert.equal(a.totalPago, 8000);
  // memoria sem linha de retencao/multa
  assert.ok(!a.memoria.some((l) => l.rotulo.toLowerCase().includes("reten")));
  assert.ok(a.memoria.some((l) => l.tipo === "credito" && l.valor === 2000));
});

test("calcularAcertoCreditoEscopo: pago <= novo -> credito zero (nao devolve)", () => {
  const a = calcularAcertoCreditoEscopo({ valorProgramaNovo: 9000, jaPago: 4000 });
  assert.equal(a.creditoDevolver, 0);
});

test("calcularAcertoCreditoEscopo: arredonda a 2 casas", () => {
  const a = calcularAcertoCreditoEscopo({ valorProgramaNovo: 100.001, jaPago: 250.006 });
  assert.equal(a.creditoDevolver, 150.01);
});

// ---- Fatia A: retencao parametrizada (config por instancia) ----------------

test("determinarRetencaoPercentual: faixas da config sobrescrevem o placeholder", () => {
  const faixas = [
    { minDiasAteInicio: 90, percentual: 0.05 },
    { minDiasAteInicio: 0, percentual: 0.4 },
  ];
  assert.equal(determinarRetencaoPercentual("cancelamento_cliente", 100, faixas), 0.05);
  assert.equal(determinarRetencaoPercentual("cancelamento_cliente", 10, faixas), 0.4);
});

test("determinarRetencaoPercentual: tiposSemRetencao da config define quem tem multa", () => {
  // Com a config, escola PASSA a ter retencao e cliente fica isento (hipotetico).
  const faixas = RETENCAO_PLACEHOLDER;
  assert.equal(determinarRetencaoPercentual("cancelamento_escola", 10, faixas, []), 0.5);
  assert.equal(
    determinarRetencaoPercentual("cancelamento_cliente", 10, faixas, ["cancelamento_cliente"]),
    0
  );
});

test("validarFaixasRetencao: aceita faixas validas, recusa invalidas/vazias", () => {
  assert.deepEqual(validarFaixasRetencao([{ minDiasAteInicio: 0, percentual: 0.5 }]), { ok: true });
  assert.equal(validarFaixasRetencao([]).ok, false);
  assert.equal(validarFaixasRetencao("x").ok, false);
  assert.equal(validarFaixasRetencao([{ minDiasAteInicio: -1, percentual: 0.5 }]).motivo, "minDiasAteInicio_invalido");
  assert.equal(validarFaixasRetencao([{ minDiasAteInicio: 0, percentual: 1.5 }]).motivo, "percentual_invalido");
});

// ---- Fatia B: ciclo de vida (proposta + aceite) ----------------------------

test("transicaoAcertoPermitida: fluxo valido rascunho->proposto->aceito->executado", () => {
  assert.equal(transicaoAcertoPermitida("rascunho", "proposto"), true);
  assert.equal(transicaoAcertoPermitida("proposto", "aceito"), true);
  assert.equal(transicaoAcertoPermitida("aceito", "executado"), true);
  // cancelar permitido enquanto nao executado
  assert.equal(transicaoAcertoPermitida("proposto", "cancelado"), true);
  assert.equal(transicaoAcertoPermitida("aceito", "cancelado"), true);
});

test("transicaoAcertoPermitida: recusa pulos e estados terminais", () => {
  assert.equal(transicaoAcertoPermitida("rascunho", "aceito"), false); // pulou proposto
  assert.equal(transicaoAcertoPermitida("rascunho", "executado"), false);
  assert.equal(transicaoAcertoPermitida("executado", "cancelado"), false); // terminal
  assert.equal(transicaoAcertoPermitida("cancelado", "proposto"), false); // terminal
});

test("renderizarTermoAcerto: deterministico (hash estavel) e reflete a memoria", () => {
  const memoria = [
    { rotulo: "Valor total do programa", valor: 10000, tipo: "info" as const },
    { rotulo: "Retenção contratual (25%)", valor: 2500, tipo: "debito" as const },
    { rotulo: "Saldo a devolver ao cliente", valor: 3500, tipo: "credito" as const },
  ];
  const a = renderizarTermoAcerto({ moeda: "CAD", memoria, saldoDevolverCliente: 3500, provisorio: true });
  const b = renderizarTermoAcerto({ moeda: "CAD", memoria, saldoDevolverCliente: 3500, provisorio: true });
  assert.equal(a, b); // deterministico
  assert.ok(a.includes("CAD 3500.00"));
  assert.ok(a.includes("provisorios")); // aviso quando provisorio
  const semAviso = renderizarTermoAcerto({ moeda: "CAD", memoria, saldoDevolverCliente: 3500, provisorio: false });
  assert.ok(!semAviso.includes("provisorios"));
});

// ---- Fatia C: planejamento do refund (estorno via MP) ----------------------

test("planejarRefund: fracao BRL do que foi pago, particionada (soma exata)", () => {
  // saldoDevolver 7500 de 10000 pago -> 75%. Pago BRL: 4000 + 6000 = 10000.
  const p = planejarRefund({
    saldoDevolver: 7500,
    totalPago: 10000,
    pagamentos: [
      { id: "a", externalPaymentId: "mpA", valorBRL: 4000, pagoEmISO: "2026-01-10" },
      { id: "b", externalPaymentId: "mpB", valorBRL: 6000, pagoEmISO: "2026-02-10" },
    ],
    hojeISO: "2026-03-01",
    janelaDias: 90,
  });
  assert.equal(p.meio, "mp");
  assert.equal(p.refundBRL, 7500); // 75% de 10000 BRL
  // do mais recente ao mais antigo: b (6000) inteiro + a (1500)
  assert.equal(p.itens[0].pagamentoId, "b");
  assert.equal(p.itens[0].valorBRL, 6000);
  assert.equal(p.itens[1].pagamentoId, "a");
  assert.equal(p.itens[1].valorBRL, 1500);
  assert.equal(p.itens.reduce((s, i) => s + i.valorBRL, 0), 7500);
});

test("planejarRefund: refund total (100%) estorna todos os pagamentos", () => {
  const p = planejarRefund({
    saldoDevolver: 10000,
    totalPago: 10000,
    pagamentos: [{ id: "a", externalPaymentId: "mpA", valorBRL: 4500, pagoEmISO: "2026-01-10" }],
    hojeISO: "2026-02-01",
  });
  assert.equal(p.meio, "mp");
  assert.equal(p.refundBRL, 4500);
  assert.equal(p.itens.length, 1);
  assert.equal(p.itens[0].valorBRL, 4500);
});

test("planejarRefund: em disputa -> fallback manual (sem itens)", () => {
  const p = planejarRefund({
    saldoDevolver: 5000,
    totalPago: 10000,
    pagamentos: [
      { id: "a", externalPaymentId: "mpA", valorBRL: 10000, emDisputa: true, pagoEmISO: "2026-01-10" },
    ],
    hojeISO: "2026-02-01",
  });
  assert.equal(p.meio, "manual");
  assert.equal(p.motivoManual, "em_disputa");
  assert.deepEqual(p.itens, []);
  assert.equal(p.refundBRL, 5000); // valor calculado, mas devolucao manual
});

test("planejarRefund: fora da janela -> fallback manual", () => {
  const p = planejarRefund({
    saldoDevolver: 5000,
    totalPago: 10000,
    pagamentos: [{ id: "a", externalPaymentId: "mpA", valorBRL: 10000, pagoEmISO: "2025-01-10" }],
    hojeISO: "2026-02-01", // > 90 dias
    janelaDias: 90,
  });
  assert.equal(p.meio, "manual");
  assert.equal(p.motivoManual, "fora_da_janela");
});

test("planejarRefund: saldo zero -> nada a estornar", () => {
  const p = planejarRefund({
    saldoDevolver: 0,
    totalPago: 10000,
    pagamentos: [{ id: "a", externalPaymentId: "mpA", valorBRL: 10000, pagoEmISO: "2026-01-10" }],
    hojeISO: "2026-02-01",
  });
  assert.equal(p.refundBRL, 0);
  assert.deepEqual(p.itens, []);
});

test("planejarRefund: saldo>0 mas sem BRL pago -> manual (sem_pagamentos)", () => {
  const p = planejarRefund({
    saldoDevolver: 5000,
    totalPago: 5000,
    pagamentos: [], // ledger vazio
    hojeISO: "2026-02-01",
  });
  assert.equal(p.meio, "manual");
  assert.equal(p.motivoManual, "sem_pagamentos");
  assert.deepEqual(p.itens, []);
});

test("planejarRefund: pago_em invalido -> fora da janela (manual, nao MP)", () => {
  const p = planejarRefund({
    saldoDevolver: 5000,
    totalPago: 10000,
    pagamentos: [{ id: "a", externalPaymentId: "mpA", valorBRL: 10000, pagoEmISO: "" }],
    hojeISO: "2026-02-01",
  });
  assert.equal(p.meio, "manual");
  assert.equal(p.motivoManual, "fora_da_janela");
});
