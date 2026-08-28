import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularPrevisao, type AcordoComissao } from "./payout-calc.ts";

const pct15: AcordoComissao = { basis: "total", type: "percent", value: 15 };

// T1: percentual — comissao 15% sobre 1000, liquido 850, vencimento D-30.
test("T1 comissao percentual + vencimento D-30", () => {
  const p = calcularPrevisao({
    grossAmount: 1000,
    currency: "CAD",
    dataInicio: "2026-10-01",
    prazoDias: 30,
    acordo: pct15,
    hoje: "2026-08-01",
  });
  assert.equal(p.grossAmount, 1000);
  assert.equal(p.commissionAmount, 150);
  assert.equal(p.netAmount, 850);
  assert.equal(p.currency, "CAD");
  assert.equal(p.dueDate, "2026-09-01"); // 30 dias antes de 01/out
  assert.equal(p.diasAteVencimento, 31); // de 01/ago a 01/set
  assert.equal(p.comissaoDefinida, true);
});

// T2: basis 'none' — sem comissao, liquido = bruto.
test("T2 acordo none: comissao 0, liquido = bruto", () => {
  const p = calcularPrevisao({
    grossAmount: 2000,
    currency: "USD",
    dataInicio: "2026-12-01",
    prazoDias: 30,
    acordo: { basis: "none", type: "percent", value: 0 },
    hoje: "2026-08-01",
  });
  assert.equal(p.commissionAmount, 0);
  assert.equal(p.netAmount, 2000);
  assert.equal(p.comissaoDefinida, true);
});

// T3: valor fixo por venda.
test("T3 fixed_per_sale", () => {
  const p = calcularPrevisao({
    grossAmount: 1000,
    currency: "CAD",
    dataInicio: "2026-10-01",
    prazoDias: 30,
    acordo: { basis: "total", type: "fixed_per_sale", value: 200, currency: "CAD" },
    hoje: "2026-08-01",
  });
  assert.equal(p.commissionAmount, 200);
  assert.equal(p.netAmount, 800);
});

// T4: valor fixo por semana * numero de semanas.
test("T4 fixed_per_week * semanas", () => {
  const p = calcularPrevisao({
    grossAmount: 5000,
    currency: "CAD",
    dataInicio: "2026-10-01",
    prazoDias: 30,
    acordo: { basis: "tuition", type: "fixed_per_week", value: 50, currency: "CAD" },
    semanas: 12,
    hoje: "2026-08-01",
  });
  assert.equal(p.commissionAmount, 600);
  assert.equal(p.netAmount, 4400);
});

// T5: sem acordo -> comissao/liquido "a definir", mas bruto e vencimento seguem.
test("T5 sem acordo: comissao null, previsao de vencimento mantida", () => {
  const p = calcularPrevisao({
    grossAmount: 1000,
    currency: "CAD",
    dataInicio: "2026-10-01",
    prazoDias: 30,
    acordo: null,
    hoje: "2026-08-01",
  });
  assert.equal(p.commissionAmount, null);
  assert.equal(p.netAmount, null);
  assert.equal(p.comissaoDefinida, false);
  assert.equal(p.grossAmount, 1000);
  assert.equal(p.dueDate, "2026-09-01");
});

// T6: sem data_inicio -> sem vencimento nem dias, mas comissao/liquido seguem.
test("T6 sem data_inicio: vencimento null", () => {
  const p = calcularPrevisao({
    grossAmount: 1000,
    currency: "CAD",
    dataInicio: null,
    prazoDias: 30,
    acordo: pct15,
    hoje: "2026-08-01",
  });
  assert.equal(p.dueDate, null);
  assert.equal(p.diasAteVencimento, null);
  assert.equal(p.netAmount, 850);
});

// T7: valor fixo em moeda diferente do bruto -> nao calcula (nunca adivinha cambio).
test("T7 moeda divergente em valor fixo: comissao null", () => {
  const p = calcularPrevisao({
    grossAmount: 1000,
    currency: "CAD",
    dataInicio: "2026-10-01",
    prazoDias: 30,
    acordo: { basis: "total", type: "fixed_per_sale", value: 200, currency: "USD" },
    hoje: "2026-08-01",
  });
  assert.equal(p.commissionAmount, null);
  assert.equal(p.netAmount, null);
  assert.equal(p.comissaoDefinida, false);
});

// T8: comissao maior que o bruto -> liquido pisado em 0 e comissao retida
// capada no bruto (nunca mostra comissao > bruto).
test("T8 comissao capada no bruto, liquido nunca negativo", () => {
  const p = calcularPrevisao({
    grossAmount: 100,
    currency: "CAD",
    dataInicio: "2026-10-01",
    prazoDias: 30,
    acordo: { basis: "total", type: "fixed_per_sale", value: 300, currency: "CAD" },
    hoje: "2026-08-01",
  });
  assert.equal(p.commissionAmount, 100);
  assert.equal(p.netAmount, 0);
});

// T10: percentual sobre base != total (tuition) -> "a definir" (Fatia 1 nao
// tem a decomposicao tuition/fees por caso; nunca adivinha).
test("T10 percentual sobre tuition: comissao a definir", () => {
  const p = calcularPrevisao({
    grossAmount: 10000,
    currency: "USD",
    dataInicio: "2026-10-01",
    prazoDias: 30,
    acordo: { basis: "tuition", type: "percent", value: 15 },
    hoje: "2026-08-01",
  });
  assert.equal(p.commissionAmount, null);
  assert.equal(p.netAmount, null);
  assert.equal(p.comissaoDefinida, false);
  assert.equal(p.grossAmount, 10000); // bruto e vencimento seguem visiveis
  assert.equal(p.dueDate, "2026-09-01");
});

// T9: prazo configuravel (D-45) e vencimento ja vencido (dias negativo).
test("T9 prazo D-45 e vencimento vencido", () => {
  const p = calcularPrevisao({
    grossAmount: 1000,
    currency: "CAD",
    dataInicio: "2026-09-01",
    prazoDias: 45,
    acordo: pct15,
    hoje: "2026-08-01",
  });
  assert.equal(p.dueDate, "2026-07-18"); // 45 dias antes de 01/set
  assert.equal(p.diasAteVencimento, -14); // ja passou 14 dias
});
