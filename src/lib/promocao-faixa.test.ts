// Cenario REAL da VanWest com as promocoes do folheto 2026, de ponta a ponta:
// preco promocional por faixa, material gratis ate 12 semanas, matricula em
// duas faixas e as 4 semanas gratis cobradas pela tarifa de 12-23. Sao os
// numeros que vao para a cotacao do estudante.
import { test } from "node:test";
import assert from "node:assert/strict";
import { priceProduct, type Promotion } from "./pricing.ts";

const CURSO = "curso-30";
const MATERIAL = "fee-material";
const MATRICULA = "fee-matricula";

function promos(): Promotion[] {
  const alvo = [{ dimension: "product" as const, value: CURSO }];
  const faixa = (min: number, max: number | undefined, pct: number, nome: string): Promotion => ({
    id: `p${min}`, name: nome, promoType: "percent_off", value: pct, appliesTo: "tuition",
    minQuantity: min, maxQuantity: max, isStackable: true, priority: 10, status: "active", targets: alvo,
  });
  return [
    faixa(1, 11, 52.2222, "Promo 30 · 1-11"),
    faixa(12, 23, 52.8090, "Promo 30 · 12-23"),
    faixa(24, 43, 53.5632, "Promo 30 · 24-43"),
    faixa(44, undefined, 54.4578, "Promo 30 · 44+"),
    { id: "mat", name: "Material grátis até 12 semanas", promoType: "waive_fee", appliesTo: "specific_fee",
      appliesToRefId: MATERIAL, maxQuantity: 12, isStackable: true, priority: 20, status: "active", targets: [] },
    { id: "mtr", name: "Matrícula reduzida (12+)", promoType: "fixed_off", value: 50, appliesTo: "specific_fee",
      appliesToRefId: MATRICULA, minQuantity: 12, isStackable: true, priority: 30, status: "active", targets: [] },
    { id: "gra", name: "4 semanas grátis", promoType: "free_units", value: 4, freeUnitsSemantics: "bonus_on_top",
      freeUnitsTierQuantity: 12,
      appliesTo: "tuition", minQuantity: 24, isStackable: true, priority: 40, status: "active", targets: alvo },
  ];
}

function cotar(semanas: number) {
  return priceProduct({
    product: { currency: "CAD", kind: "program" },
    startDate: "2026-11-02", quantity: semanas, unit: "week",
    templates: [{ name: "ESL 30", validFrom: null, validUntil: null, tiers: [
      { minQuantity: 1, unitPrice: 450 }, { minQuantity: 12, unitPrice: 445 },
      { minQuantity: 24, unitPrice: 435 }, { minQuantity: 44, unitPrice: 415 }] }],
    transitionRule: "split_by_period",
    fees: [
      { id: MATERIAL, name: "Material didático", feeType: "material", chargeBasis: "per_unit", amount: 20, currency: "CAD" },
      { id: MATRICULA, name: "Matrícula", feeType: "registration", chargeBasis: "once_per_item", amount: 175, currency: "CAD" },
    ],
    promotions: promos(),
    context: { quoteDate: "2026-09-22", startDate: "2026-11-02", billableQuantity: semanas, productId: CURSO },
  });
}

test("8 semanas: preço promo 215/sem, material grátis, matrícula cheia", () => {
  const r = cotar(8);
  assert.equal(r.grossAmount, 8 * 450);
  const liq = r.grossAmount + r.fees.reduce((a, f) => a + f.amount, 0) - r.discounts.reduce((a, d) => a + d.amount, 0);
  assert.equal(liq, 8 * 215 + 175); // curso promocional + matrícula; material zerado
  assert.equal(r.warnings.length, 0);
});

test("12 semanas: material ainda grátis (teto inclusivo) e matrícula cai para 125", () => {
  const r = cotar(12);
  const liq = r.grossAmount + r.fees.reduce((a, f) => a + f.amount, 0) - r.discounts.reduce((a, d) => a + d.amount, 0);
  assert.equal(liq, 12 * 210 + 125);
});

test("13 semanas: material volta a ser cobrado", () => {
  const r = cotar(13);
  const liq = r.grossAmount + r.fees.reduce((a, f) => a + f.amount, 0) - r.discounts.reduce((a, d) => a + d.amount, 0);
  assert.equal(liq, 13 * 210 + 125 + 13 * 20);
});

// Folheto: quem contrata 24 recebe 28, mas paga "pela tarifa aplicável ao
// período de 12 a 23 semanas" — que é MAIS CARA (210) que a faixa de 24 (202).
// O curso e o desconto promocional precisam seguir a MESMA faixa; as taxas
// continuam olhando a duração real (24 semanas de material, matrícula 12+).
test("24 semanas: 4 grátis, cobradas pela faixa de 12-23 como manda o folheto", () => {
  const r = cotar(24);
  assert.equal(r.deliveredQuantity, 28);
  assert.equal(r.billableQuantity, 24);
  assert.equal(r.grossAmount, 24 * 445); // faixa de 12-23, não a de 24
  const liq = r.grossAmount + r.fees.reduce((a, f) => a + f.amount, 0) - r.discounts.reduce((a, d) => a + d.amount, 0);
  assert.equal(liq, 24 * 210 + 125 + 24 * 20);
});

// A faixa sobreposta vale para o PREÇO, não para as taxas: senão "material
// grátis até 12 semanas" passaria a valer numa reserva de 24.
test("a faixa sobreposta não libera o material grátis numa reserva de 24 semanas", () => {
  const r = cotar(24);
  const material = r.fees.find((f) => f.name.includes("Material"));
  assert.equal(material?.amount, 24 * 20);
  assert.ok(!r.discounts.some((d) => d.name.includes("Material")));
});
