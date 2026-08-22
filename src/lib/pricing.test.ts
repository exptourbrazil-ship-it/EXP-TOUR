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
  applyFees,
  isPromotionApplicable,
  applyPromotions,
  priceProduct,
  type Tier,
  type Template,
  type Fee,
  type FeeContext,
  type Promotion,
  type PromoContext,
  type PriceRequest,
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

// ---------------------------------------------------------------------------
// TAXAS: applyFees (secao 4.5)
// ---------------------------------------------------------------------------

// Contexto base de taxas: 10 unidades cobraveis, 3 itens, 2 pessoas, 1 programa.
const FEE_CTX: FeeContext = {
  billableQuantity: 10,
  itemCount: 3,
  personCount: 2,
  programItemCount: 1,
  multiCourseRule: "charge_highest",
};

test("applyFees calcula once_per_quote x per_unit x per_person", () => {
  const fees: Fee[] = [
    { name: "Taxa bancaria", feeType: "bank", chargeBasis: "once_per_quote", amount: 25, currency: "CAD" },
    { name: "Material", feeType: "material", chargeBasis: "per_unit", amount: 10, currency: "CAD" },
    { name: "Servico", feeType: "service", chargeBasis: "per_person", amount: 50, currency: "CAD" },
  ];
  const r = applyFees(fees, FEE_CTX);
  assert.equal(r.fees.length, 3);
  assert.equal(r.fees[0].amount, 25); // uma vez
  assert.equal(r.fees[1].amount, 100); // 10 x 10 unidades
  assert.equal(r.fees[2].amount, 100); // 50 x 2 pessoas
  assert.equal(r.total, 225);
});

test("applyFees calcula once_per_item = amount x itemCount", () => {
  const fees: Fee[] = [
    { name: "Courier", feeType: "courier", chargeBasis: "once_per_item", amount: 30, currency: "CAD" },
  ];
  const r = applyFees(fees, FEE_CTX);
  assert.equal(r.fees[0].amount, 90); // 30 x 3 itens
  assert.equal(r.total, 90);
});

test("applyFees com 1 programa cobra matricula normalmente (sem regra multi-curso)", () => {
  const fees: Fee[] = [
    { name: "Matricula", feeType: "registration", chargeBasis: "once_per_quote", amount: 160, currency: "CAD" },
  ];
  const r = applyFees(fees, { ...FEE_CTX, programItemCount: 1 });
  assert.equal(r.fees.length, 1);
  assert.equal(r.fees[0].amount, 160);
  assert.equal(r.total, 160);
});

test("applyFees multi-curso: 2 matriculas 160 e 200 -> highest/lowest/all (reusa T6)", () => {
  const fees: Fee[] = [
    { name: "Matricula A", feeType: "registration", chargeBasis: "once_per_item", amount: 160, currency: "CAD" },
    { name: "Matricula B", feeType: "registration", chargeBasis: "once_per_item", amount: 200, currency: "CAD" },
  ];
  const base = { ...FEE_CTX, programItemCount: 2 };

  const highest = applyFees(fees, { ...base, multiCourseRule: "charge_highest" });
  assert.equal(highest.total, 200);

  const lowest = applyFees(fees, { ...base, multiCourseRule: "charge_lowest" });
  assert.equal(lowest.total, 160);

  const all = applyFees(fees, { ...base, multiCourseRule: "charge_all" });
  assert.equal(all.total, 360);
});

test("applyFees multi-curso agrega matriculas mas mantem outras taxas separadas", () => {
  const fees: Fee[] = [
    { name: "Matricula A", feeType: "registration", chargeBasis: "once_per_item", amount: 160, currency: "CAD" },
    { name: "Matricula B", feeType: "registration", chargeBasis: "once_per_item", amount: 200, currency: "CAD" },
    { name: "Taxa bancaria", feeType: "bank", chargeBasis: "once_per_quote", amount: 25, currency: "CAD" },
  ];
  const r = applyFees(fees, { ...FEE_CTX, programItemCount: 2, multiCourseRule: "charge_highest" });
  // 1 linha agregada de matricula (200) + 1 linha da taxa bancaria (25)
  assert.equal(r.fees.length, 2);
  assert.equal(r.total, 225);
});

// ---------------------------------------------------------------------------
// PROMOCOES: aplicabilidade (secao 4.5)
// ---------------------------------------------------------------------------

// Promo base ativa, 30% sobre tuition, alvo mercado BR + nacionalidade br.
const PROMO_BASE: Promotion = {
  name: "Desconto Brasil 30%",
  promoType: "percent_off",
  value: 30,
  appliesTo: "tuition",
  isStackable: false,
  priority: 10,
  status: "active",
  bookingFrom: "2026-01-01",
  bookingUntil: "2026-12-31",
  travelFrom: "2026-01-01",
  travelUntil: "2027-12-31",
  targets: [
    { dimension: "market", value: "BR" },
    { dimension: "nationality", value: "br" },
  ],
};

const PROMO_CTX: PromoContext = {
  quoteDate: "2026-08-21",
  startDate: "2026-09-01",
  billableQuantity: 52,
  marketId: "BR",
  nationalityCode: "br",
};

test("isPromotionApplicable: promo base dispara no contexto alvo", () => {
  assert.equal(isPromotionApplicable(PROMO_BASE, PROMO_CTX), true);
});

test("isPromotionApplicable: NAO dispara fora da janela de reserva (bookingUntil < quoteDate)", () => {
  const promo: Promotion = { ...PROMO_BASE, bookingUntil: "2026-07-31" };
  assert.equal(isPromotionApplicable(promo, PROMO_CTX), false);
});

test("isPromotionApplicable: NAO dispara por nacionalidade fora do alvo", () => {
  const ctx: PromoContext = { ...PROMO_CTX, nationalityCode: "pt" };
  assert.equal(isPromotionApplicable(PROMO_BASE, ctx), false);
});

test("isPromotionApplicable: status != active nao dispara", () => {
  assert.equal(isPromotionApplicable({ ...PROMO_BASE, status: "draft" }, PROMO_CTX), false);
});

test("isPromotionApplicable: minQuantity nao atingido nao dispara", () => {
  const promo: Promotion = { ...PROMO_BASE, minQuantity: 100 };
  assert.equal(isPromotionApplicable(promo, PROMO_CTX), false);
});

test("isPromotionApplicable: dimensao sem alvo nao restringe (OU dentro, E entre)", () => {
  const promo: Promotion = {
    ...PROMO_BASE,
    // duas nacionalidades no OU; mercado ausente do contexto nao restringe pois nao ha alvo de mercado
    targets: [
      { dimension: "nationality", value: "br" },
      { dimension: "nationality", value: "ar" },
    ],
  };
  const ctx: PromoContext = { quoteDate: "2026-08-21", startDate: "2026-09-01", billableQuantity: 52, nationalityCode: "ar" };
  assert.equal(isPromotionApplicable(promo, ctx), true);
});

// ---------------------------------------------------------------------------
// PROMOCOES: aplicacao (secao 4.5)
// ---------------------------------------------------------------------------

const PROMO_BASES = { tuition: 19760, accommodation: 17680, insurance: 925.65, fees: 1525, total: 39890.65 };

test("applyPromotions: 30% sobre tuition confere com T7 (19760 -> 5928)", () => {
  const r = applyPromotions([PROMO_BASE], PROMO_BASES, PROMO_CTX);
  assert.equal(r.discounts.length, 1);
  assert.equal(r.discounts[0].amount, 5928);
  assert.equal(r.discounts[0].appliesTo, "tuition");
  assert.equal(r.totalDiscount, 5928);
});

test("applyPromotions: duas nao-empilhaveis, so a de menor priority e aplicada", () => {
  const p1: Promotion = { ...PROMO_BASE, name: "P1 prioridade 10", priority: 10, isStackable: false };
  const p2: Promotion = {
    ...PROMO_BASE,
    name: "P2 prioridade 20",
    priority: 20,
    isStackable: false,
    promoType: "fixed_off",
    value: 500,
    appliesTo: "accommodation",
  };
  // entrada fora de ordem para provar a ordenacao por priority
  const r = applyPromotions([p2, p1], PROMO_BASES, PROMO_CTX);
  assert.equal(r.discounts.length, 1);
  assert.equal(r.discounts[0].name, "P1 prioridade 10");
  assert.equal(r.totalDiscount, 5928);
});

test("applyPromotions: duas empilhaveis somam os descontos", () => {
  const p1: Promotion = { ...PROMO_BASE, name: "P1", priority: 10, isStackable: true };
  const p2: Promotion = {
    ...PROMO_BASE,
    name: "P2",
    priority: 20,
    isStackable: true,
    promoType: "fixed_off",
    value: 500,
    appliesTo: "accommodation",
  };
  const r = applyPromotions([p1, p2], PROMO_BASES, PROMO_CTX);
  assert.equal(r.discounts.length, 2);
  assert.equal(r.totalDiscount, 6428); // 5928 + 500
});

test("applyPromotions: maxDiscountAmount funciona como teto por promocao", () => {
  const promo: Promotion = { ...PROMO_BASE, maxDiscountAmount: 4000 };
  const r = applyPromotions([promo], PROMO_BASES, PROMO_CTX);
  assert.equal(r.discounts[0].amount, 4000); // 5928 limitado a 4000
  assert.equal(r.totalDiscount, 4000);
});

test("applyPromotions: fixed_off usa value como valor absoluto", () => {
  const promo: Promotion = { ...PROMO_BASE, promoType: "fixed_off", value: 250, appliesTo: "total" };
  const r = applyPromotions([promo], PROMO_BASES, PROMO_CTX);
  assert.equal(r.discounts[0].amount, 250);
});

test("applyPromotions: promo nao aplicavel (fora do alvo) nao gera desconto", () => {
  const ctx: PromoContext = { ...PROMO_CTX, nationalityCode: "pt" };
  const r = applyPromotions([PROMO_BASE], PROMO_BASES, ctx);
  assert.equal(r.discounts.length, 0);
  assert.equal(r.totalDiscount, 0);
});

// ---------------------------------------------------------------------------
// ORQUESTRACAO: priceProduct (secao 4.1/4.2, aceite do Marco 4)
// ---------------------------------------------------------------------------

// Template aberto com os tiers do seed (CAD).
const OPEN_TEMPLATE: Template = {
  name: "Seed",
  validFrom: null,
  validUntil: null,
  tiers: BASE_TIERS,
};

// Contexto do estudante (BR) sempre aplicavel para a promo de 30%.
const PP_CONTEXT: PromoContext = {
  quoteDate: "2026-08-21",
  startDate: "2026-09-07",
  billableQuantity: 10,
  marketId: "BR",
  nationalityCode: "br",
};

// Promo do seed: 30% off tuition, alvo mercado BR, sempre ativa (sem janelas).
const PP_PROMO: Promotion = {
  name: "Brasil 30% off",
  promoType: "percent_off",
  value: 30,
  appliesTo: "tuition",
  isStackable: false,
  priority: 10,
  status: "active",
  targets: [{ dimension: "market", value: "BR" }],
};

test("priceProduct (aceite Marco 4): 10 semanas flat + matricula 160 + 30% off tuition", () => {
  const req: PriceRequest = {
    product: { currency: "CAD", kind: "program", availableFrom: "2026-01-01", availableUntil: "2027-12-31" },
    startDate: "2026-09-07",
    quantity: 10,
    unit: "week",
    templates: [OPEN_TEMPLATE],
    transitionRule: "split_by_period",
    chargeInTiers: false,
    fees: [
      { name: "Matricula", feeType: "registration", chargeBasis: "once_per_quote", amount: 160, currency: "CAD" },
    ],
    promotions: [PP_PROMO],
    context: PP_CONTEXT,
  };
  const r = priceProduct(req);

  assert.equal(r.grossAmount, 5750); // 10 x 575 (faixa do total 10)
  assert.equal(r.averageUnitPrice, 575);
  assert.equal(r.billableQuantity, 10);
  assert.equal(r.deliveredQuantity, 10);
  assert.equal(r.endDate, "2026-11-16"); // 2026-09-07 + 70 dias

  assert.equal(r.fees.length, 1);
  assert.equal(r.fees[0].amount, 160);

  assert.equal(r.discounts.length, 1);
  assert.equal(r.discounts[0].amount, 1725); // 30% de 5750

  assert.equal(r.netAmount, 4185); // 5750 + 160 - 1725
  assert.equal(r.warnings.length, 0);
});

test("priceProduct: converte para BRL quando presentmentCurrency difere", () => {
  const req: PriceRequest = {
    product: { currency: "CAD" },
    startDate: "2026-09-07",
    quantity: 10,
    unit: "week",
    templates: [OPEN_TEMPLATE],
    transitionRule: "use_start_date_price",
    fees: [],
    promotions: [],
    context: PP_CONTEXT,
    fx: { referenceRate: 4, markupPercent: 0, rounding: "none", presentmentCurrency: "BRL" },
  };
  const r = priceProduct(req);
  assert.equal(r.netAmount, 5750);
  assert.equal(r.presentment?.currency, "BRL");
  assert.equal(r.presentment?.amount, 23000); // 5750 x 4
  assert.equal(r.presentment?.effectiveRate, 4);
});

test("priceProduct: freeUnits bonus_on_top separa billable e delivered", () => {
  const req: PriceRequest = {
    product: { currency: "CAD" },
    startDate: "2026-09-07",
    quantity: 20,
    unit: "week",
    templates: [OPEN_TEMPLATE],
    transitionRule: "split_by_period",
    fees: [],
    promotions: [],
    freeUnits: { semantics: "bonus_on_top", units: 4 },
    context: { ...PP_CONTEXT, billableQuantity: 20 },
  };
  const r = priceProduct(req);
  assert.equal(r.billableQuantity, 20);
  assert.equal(r.deliveredQuantity, 24);
  assert.equal(r.grossAmount, 11400); // 20 x 570 (faixa do total 20)
  assert.equal(r.discounts.length, 0); // bonus nao gera desconto
  assert.equal(r.netAmount, 11400);
  assert.equal(r.endDate, "2027-02-22"); // 2026-09-07 + 24 semanas (168 dias)
});

test("priceProduct: freeUnits discount_on_booked gera linha de desconto embutida", () => {
  const req: PriceRequest = {
    product: { currency: "CAD" },
    startDate: "2026-09-07",
    quantity: 20,
    unit: "week",
    templates: [OPEN_TEMPLATE],
    transitionRule: "split_by_period",
    fees: [],
    promotions: [],
    freeUnits: { semantics: "discount_on_booked", units: 4 },
    context: { ...PP_CONTEXT, billableQuantity: 20 },
  };
  const r = priceProduct(req);
  assert.equal(r.grossAmount, 11400);
  assert.equal(r.billableQuantity, 16);
  assert.equal(r.deliveredQuantity, 20);
  assert.equal(r.discounts.length, 1);
  assert.equal(r.discounts[0].amount, 2280); // 4 x 570
  assert.equal(r.netAmount, 9120); // 11400 - 2280
});

test("priceProduct: buraco de template -> warning bloqueante e amounts 0", () => {
  const templateA: Template = { name: "A", validFrom: null, validUntil: "2026-06-14", tiers: BASE_TIERS };
  const templateBGap: Template = { name: "B", validFrom: "2026-07-01", validUntil: null, tiers: BASE_TIERS };
  const req: PriceRequest = {
    product: { currency: "CAD" },
    startDate: "2026-05-25",
    quantity: 10,
    unit: "week",
    templates: [templateA, templateBGap],
    transitionRule: "split_by_period",
    fees: [
      { name: "Matricula", feeType: "registration", chargeBasis: "once_per_quote", amount: 160, currency: "CAD" },
    ],
    promotions: [PP_PROMO],
    context: { ...PP_CONTEXT, startDate: "2026-05-25" },
  };
  const r = priceProduct(req);
  assert.equal(r.grossAmount, 0);
  assert.equal(r.netAmount, 0);
  assert.equal(r.averageUnitPrice, 0);
  assert.equal(r.fees.length, 0);
  assert.equal(r.discounts.length, 0);
  assert.ok(r.warnings.some((w) => /bloqueante/i.test(w)));
});

test("priceProduct: disponibilidade fora da janela gera warning nao bloqueante", () => {
  const req: PriceRequest = {
    product: { currency: "CAD", minDuration: 2, maxDuration: 8, availableUntil: "2026-08-31" },
    startDate: "2026-09-07", // depois de availableUntil
    quantity: 10, // acima de maxDuration
    unit: "week",
    templates: [OPEN_TEMPLATE],
    transitionRule: "split_by_period",
    fees: [],
    promotions: [],
    context: PP_CONTEXT,
  };
  const r = priceProduct(req);
  // Nao bloqueia: calcula normalmente e apenas alerta.
  assert.equal(r.grossAmount, 5750);
  assert.equal(r.warnings.length, 2);
});
