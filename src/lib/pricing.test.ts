// Suite do motor de preco (Marco 2 da spec de Catalogo/Preco/Cotacao).
// TESTE ANTES DO CODIGO: os casos T1-T8 tem numeros fechados (secao 4.6 da spec).
// Roda com o runner nativo do Node: `npm test` (node --test), sem dependencias.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  round2,
  sumMoney,
  averageUnitPrice,
  percentOff,
  tierFor,
  priceFlat,
  priceProgressive,
  priceTier,
  calcWithTransition,
  applyFreeUnits,
  aggregateRegistrationFee,
  convertFx,
  type Tier,
  type Template,
} from "./pricing.ts";

// Tiers base usados em T1-T5 (moeda de referencia CAD).
const BASE_TIERS: Tier[] = [
  { minQuantity: 1, unitPrice: 580 },
  { minQuantity: 9, unitPrice: 575 },
  { minQuantity: 13, unitPrice: 570 },
];

// ---------------------------------------------------------------------------
// Utilitarios de dinheiro
// ---------------------------------------------------------------------------

test("round2 arredonda com half away from zero", () => {
  assert.equal(round2(2.545), 2.55);
  assert.equal(round2(2.554), 2.55);
  assert.equal(round2(2.555), 2.56);
  assert.equal(round2(-2.545), -2.55);
  assert.equal(round2(575), 575);
  assert.equal(round2(0.005), 0.01);
});

test("sumMoney soma linhas ja arredondadas e limpa o drift de float", () => {
  assert.equal(sumMoney([0.1, 0.2]), 0.3);
  assert.equal(sumMoney([1725, 4165]), 5890);
  assert.equal(sumMoney([]), 0);
});

test("averageUnitPrice divide bruto pela quantidade e arredonda", () => {
  assert.equal(averageUnitPrice(5750, 10), 575);
  assert.equal(averageUnitPrice(5790, 10), 579);
  assert.equal(averageUnitPrice(19760, 52), 380); // T7
  assert.equal(averageUnitPrice(925.65, 363), 2.55); // T7
});

test("percentOff calcula o desconto (percentual em fracao) arredondado", () => {
  assert.equal(percentOff(19760, 0.3), 5928); // T7: 30% de 19760
  assert.equal(percentOff(100, 0.1), 10);
});

// ---------------------------------------------------------------------------
// Faixas (tiers)
// ---------------------------------------------------------------------------

test("tierFor devolve a maior faixa cujo minQuantity cabe na quantidade", () => {
  assert.equal(tierFor(BASE_TIERS, 1).unitPrice, 580);
  assert.equal(tierFor(BASE_TIERS, 8).unitPrice, 580);
  assert.equal(tierFor(BASE_TIERS, 9).unitPrice, 575);
  assert.equal(tierFor(BASE_TIERS, 10).unitPrice, 575);
  assert.equal(tierFor(BASE_TIERS, 12).unitPrice, 575);
  assert.equal(tierFor(BASE_TIERS, 13).unitPrice, 570);
  assert.equal(tierFor(BASE_TIERS, 20).unitPrice, 570);
});

test("tierFor lanca erro quando a quantidade fica abaixo da faixa minima", () => {
  assert.throws(() => tierFor(BASE_TIERS, 0), /faixa/i);
});

// ---------------------------------------------------------------------------
// T1 / T2: precificacao flat vs progressiva
// ---------------------------------------------------------------------------

test("T1: flat 10 semanas -> 5750,00 (media 575,00)", () => {
  const amount = priceFlat(BASE_TIERS, 10);
  assert.equal(amount, 5750);
  assert.equal(averageUnitPrice(amount, 10), 575);
});

test("T2: progressive 10 semanas -> 5790,00 (8x580 + 2x575; media 579,00)", () => {
  const amount = priceProgressive(BASE_TIERS, 10);
  assert.equal(amount, 5790);
  assert.equal(averageUnitPrice(amount, 10), 579);
});

test("priceTier despacha entre flat e progressive por charge_in_tiers", () => {
  assert.equal(priceTier(BASE_TIERS, 10, false), 5750);
  assert.equal(priceTier(BASE_TIERS, 10, true), 5790);
});

// ---------------------------------------------------------------------------
// T3 / T3b: transicao de template no periodo
// ---------------------------------------------------------------------------

// Template A vigente ate 2026-06-14 (tiers base); Template B a partir de 2026-06-15.
const TEMPLATE_A: Template = {
  name: "A",
  validFrom: null,
  validUntil: "2026-06-14",
  tiers: BASE_TIERS,
};
const TEMPLATE_B: Template = {
  name: "B",
  validFrom: "2026-06-15",
  validUntil: null,
  tiers: [
    { minQuantity: 1, unitPrice: 600 },
    { minQuantity: 9, unitPrice: 595 },
    { minQuantity: 13, unitPrice: 590 },
  ],
};

test("T3: split_by_period, 10 semanas de 2026-05-25 -> 5890,00 (3xA + 7xB pela faixa do total)", () => {
  const r = calcWithTransition({
    startDate: "2026-05-25",
    weeks: 10,
    templates: [TEMPLATE_A, TEMPLATE_B],
    strategy: "split_by_period",
    chargeInTiers: false,
  });
  assert.equal(r.totalQuantity, 10);
  assert.equal(r.segments.length, 2);
  // 3 semanas em A pela faixa do total 10 (575) + 7 semanas em B pela faixa do total 10 (595)
  assert.equal(r.segments[0].weeks, 3);
  assert.equal(r.segments[0].amount, 1725);
  assert.equal(r.segments[1].weeks, 7);
  assert.equal(r.segments[1].amount, 4165);
  assert.equal(r.amount, 5890);
});

test("T3b: use_start_date_price, mesma entrada -> 5750,00", () => {
  const r = calcWithTransition({
    startDate: "2026-05-25",
    weeks: 10,
    templates: [TEMPLATE_A, TEMPLATE_B],
    strategy: "use_start_date_price",
    chargeInTiers: false,
  });
  assert.equal(r.segments.length, 1);
  assert.equal(r.amount, 5750);
});

test("use_booking_date_price precifica pelo template vigente na emissao", () => {
  const r = calcWithTransition({
    startDate: "2026-05-25",
    weeks: 10,
    templates: [TEMPLATE_A, TEMPLATE_B],
    strategy: "use_booking_date_price",
    bookingDate: "2026-07-01", // dentro da vigencia do template B
    chargeInTiers: false,
  });
  assert.equal(r.segments.length, 1);
  assert.equal(r.amount, 5950); // 10 x 595 (faixa do total no template B)
});

test("periodo sem template vigente lanca erro bloqueante (warning)", () => {
  // Buraco de cobertura: template A so ate 2026-06-14 e B so a partir de 2026-07-01.
  const templateBGap: Template = { ...TEMPLATE_B, validFrom: "2026-07-01" };
  assert.throws(
    () =>
      calcWithTransition({
        startDate: "2026-05-25",
        weeks: 10,
        templates: [TEMPLATE_A, templateBGap],
        strategy: "split_by_period",
        chargeInTiers: false,
      }),
    /template/i
  );
});

// ---------------------------------------------------------------------------
// T4 / T5: unidades gratuitas (free units)
// ---------------------------------------------------------------------------

test("T4: bonus_on_top, 20 pagas + 4 bonus -> cobrado 11400,00; billable 20; delivered 24; discount 0", () => {
  const r = applyFreeUnits({
    tiers: BASE_TIERS,
    bookedQuantity: 20,
    freeUnits: 4,
    semantics: "bonus_on_top",
  });
  assert.equal(r.billableQuantity, 20);
  assert.equal(r.deliveredQuantity, 24);
  assert.equal(r.grossAmount, 11400);
  assert.equal(r.discountAmount, 0);
  assert.equal(r.netAmount, 11400);
});

test("T5: discount_on_booked, 20 contratadas, 4 gratis -> gross 11400; discount 2280; net 9120; billable 16; delivered 20", () => {
  const r = applyFreeUnits({
    tiers: BASE_TIERS,
    bookedQuantity: 20,
    freeUnits: 4,
    semantics: "discount_on_booked",
  });
  assert.equal(r.grossAmount, 11400);
  assert.equal(r.discountAmount, 2280);
  assert.equal(r.netAmount, 9120);
  assert.equal(r.billableQuantity, 16);
  assert.equal(r.deliveredQuantity, 20);
});

test("bonus_on_top x discount_on_booked diferem em billable/delivered", () => {
  const bonus = applyFreeUnits({
    tiers: BASE_TIERS,
    bookedQuantity: 20,
    freeUnits: 4,
    semantics: "bonus_on_top",
  });
  const discount = applyFreeUnits({
    tiers: BASE_TIERS,
    bookedQuantity: 20,
    freeUnits: 4,
    semantics: "discount_on_booked",
  });
  // bonus entrega mais e cobra tudo; discount entrega o contratado e cobra menos
  assert.equal(bonus.deliveredQuantity, 24);
  assert.equal(bonus.billableQuantity, 20);
  assert.equal(discount.deliveredQuantity, 20);
  assert.equal(discount.billableQuantity, 16);
  assert.notEqual(bonus.netAmount, discount.netAmount);
});

// ---------------------------------------------------------------------------
// T6: agregacao de taxa de matricula
// ---------------------------------------------------------------------------

test("T6: aggregateRegistrationFee [160,200] -> highest 200 / lowest 160 / all 360", () => {
  assert.equal(aggregateRegistrationFee([160, 200], "charge_highest"), 200);
  assert.equal(aggregateRegistrationFee([160, 200], "charge_lowest"), 160);
  assert.equal(aggregateRegistrationFee([160, 200], "charge_all"), 360);
});

// ---------------------------------------------------------------------------
// T7: integracao - soma de linhas da cotacao
// ---------------------------------------------------------------------------

test("T7: soma das linhas da cotacao -> 33962,65", () => {
  const course = priceFlat(BASE_TIERS, 52) === 0 ? 0 : 19760; // curso ja consolidado
  const lines = [
    19760, // curso
    160, // matricula
    25, // taxa bancaria
    1040, // material
    17680, // acomodacao
    300, // colocacao
    925.65, // seguro
    -percentOff(19760, 0.3), // desconto 30% sobre o curso = -5928
  ];
  void course;
  const total = sumMoney(lines);
  assert.equal(percentOff(19760, 0.3), 5928);
  assert.equal(total, 33962.65);
  assert.equal(averageUnitPrice(19760, 52), 380);
  assert.equal(averageUnitPrice(925.65, 363), 2.55);
});

// ---------------------------------------------------------------------------
// T8: conversao cambial
// ---------------------------------------------------------------------------

test("T8: convertFx(33962.65, 4.12, markup 0.02, none) -> rate 4.2024 e convertido 142724,64", () => {
  const r = convertFx({
    amount: 33962.65,
    referenceRate: 4.12,
    markupPercent: 0.02,
    rounding: "none",
  });
  assert.equal(r.effectiveRate, 4.2024);
  assert.equal(r.converted, 142724.64);
});

test("convertFx respeita arredondamentos up_1/up_10/up_100", () => {
  assert.equal(convertFx({ amount: 100, referenceRate: 1, rounding: "up_1" }).converted, 100);
  assert.equal(convertFx({ amount: 100.01, referenceRate: 1, rounding: "up_1" }).converted, 101);
  assert.equal(convertFx({ amount: 101, referenceRate: 1, rounding: "up_10" }).converted, 110);
  assert.equal(convertFx({ amount: 101, referenceRate: 1, rounding: "up_100" }).converted, 200);
  assert.equal(convertFx({ amount: 100, referenceRate: 1, rounding: "up_100" }).converted, 100);
});
