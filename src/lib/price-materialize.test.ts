// Testes do plano PURO de materializacao.
import { test } from "node:test";
import assert from "node:assert/strict";
import { planoDeMaterializacao, resumoDoPlano } from "./price-materialize.ts";
import { normalizarPriceListExtraido } from "./price-list-extract.ts";

test("programa vira product+template+tiers ordenados; moeda propagada", () => {
  const ext = normalizarPriceListExtraido({
    programs: [
      { name: "General English", educationType: "general_english", unit: "week", tiers: [{ minQuantity: 12, unitPrice: 380 }, { minQuantity: 1, unitPrice: 420 }] },
    ],
  });
  const plano = planoDeMaterializacao(ext, "CAD");
  assert.equal(plano.produtos.length, 1);
  const p = plano.produtos[0];
  assert.equal(p.kind, "program");
  assert.equal(p.template.currency, "CAD");
  assert.equal(p.template.price_basis, "duration");
  assert.equal(p.template.charge_in_tiers, false);
  assert.deepEqual(p.detail, { education_type: "general_english" });
  assert.deepEqual(p.tiers, [
    { min_quantity: 1, unit_price: 420, sort: 0 },
    { min_quantity: 12, unit_price: 380, sort: 1 },
  ]);
});

test("produto sem faixa NAO materializa (nao ha o que precificar)", () => {
  const ext = normalizarPriceListExtraido({
    accommodations: [
      { name: "Sem preco", type: "homestay", tiers: [] },
      { name: "Homestay", type: "homestay", unit: "week", tiers: [{ minQuantity: 1, unitPrice: 250 }] },
    ],
  });
  const plano = planoDeMaterializacao(ext, "CAD");
  assert.equal(plano.produtos.length, 1);
  assert.equal(plano.produtos[0].name, "Homestay");
  assert.equal(plano.produtos[0].detail.accommodation_type, "homestay");
});

test("taxa: default fee_type/charge_basis; is_mandatory; moeda", () => {
  const ext = normalizarPriceListExtraido({
    fees: [
      { name: "Registration", feeType: "registration", amount: 150, basis: "once_per_quote" },
      { name: "Sem tipo", amount: 50 }, // feeType/basis default
    ],
  });
  const plano = planoDeMaterializacao(ext, "GBP");
  assert.equal(plano.taxas.length, 2);
  assert.deepEqual(plano.taxas[0], { name: "Registration", fee_type: "registration", charge_basis: "once_per_quote", amount: 150, currency: "GBP", is_mandatory: true });
  assert.equal(plano.taxas[1].fee_type, "custom");
  assert.equal(plano.taxas[1].charge_basis, "once_per_quote");
});

test("resumoDoPlano conta produtos, taxas e faixas", () => {
  const ext = normalizarPriceListExtraido({
    programs: [{ name: "A", unit: "week", tiers: [{ minQuantity: 1, unitPrice: 10 }, { minQuantity: 4, unitPrice: 9 }] }],
    fees: [{ name: "Reg", amount: 100 }],
  });
  const r = resumoDoPlano(planoDeMaterializacao(ext, "USD"));
  assert.deepEqual(r, { produtos: 1, taxas: 1, faixas: 2 });
});
