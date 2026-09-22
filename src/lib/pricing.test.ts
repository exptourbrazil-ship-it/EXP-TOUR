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
  combinarReembolsavel,
  convertFx,
  applyFees,
  isPromotionApplicable,
  applyPromotions,
  escolherUnidadesGratuitas,
  applySeasonalAdjustments,
  priceProduct,
  type Tier,
  type Template,
  type Fee,
  type FeeContext,
  type Promotion,
  type PromoContext,
  type PromoBases,
  type PriceRequest,
  type SeasonalAdjustment,
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

test("applyPromotions: a linha carrega id e PRAZO (bookingUntil) da promocao — F5 'valida ate' no orcamento", () => {
  const promo: Promotion = { ...PROMO_BASE, id: "promo-br-30" };
  const r = applyPromotions([promo], PROMO_BASES, PROMO_CTX);
  assert.equal(r.discounts.length, 1);
  assert.equal(r.discounts[0].promotionId, "promo-br-30");
  assert.equal(r.discounts[0].validUntil, "2026-12-31"); // = bookingUntil
  // Promo sem id/bookingUntil nao inventa campos (linha continua valida).
  const { id: _id, bookingUntil: _bu, ...semPrazo } = PROMO_BASE;
  void _id; void _bu;
  const r2 = applyPromotions([semPrazo as Promotion], PROMO_BASES, PROMO_CTX);
  assert.equal(r2.discounts.length, 1);
  assert.equal(r2.discounts[0].promotionId, undefined);
  assert.equal(r2.discounts[0].validUntil, undefined);
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

// ---------------------------------------------------------------------------
// Ajuste sazonal de acomodacao (S1-S11)
// A estadia ocupa weeks*7 NOITES a partir de startDate (a noite de startDate
// conta, a data de saida nao). Periodo sem ano = recorrente todo ano.
// ---------------------------------------------------------------------------

// Alta temporada real da carga: 14/jun a 23/ago, +EUR 40/semana (recorrente).
const ALTA: SeasonalAdjustment = {
  name: "Alta temporada",
  amountPerWeek: 40,
  from: { month: 6, day: 14 },
  to: { month: 8, day: 23 },
};

test("S1: estadia inteira fora do periodo nao gera linha", () => {
  const r = applySeasonalAdjustments({
    startDate: "2026-03-02",
    weeks: 4,
    adjustments: [ALTA],
    proration: "nightly",
  });
  assert.deepEqual(r.lines, []);
  assert.equal(r.total, 0);
});

test("S2: estadia inteira dentro do periodo cobra weeks x amountPerWeek", () => {
  const r = applySeasonalAdjustments({
    startDate: "2026-06-14",
    weeks: 2,
    adjustments: [ALTA],
    proration: "nightly",
  });
  assert.equal(r.lines.length, 1);
  assert.equal(r.lines[0].nights, 14);
  assert.equal(r.lines[0].amount, 80); // 2 x 40
  assert.equal(r.lines[0].from, "2026-06-14");
  assert.equal(r.lines[0].to, "2026-06-27");
  assert.equal(r.total, 80);
});

test("S3: sobreposicao parcial no inicio e no fim (71 noites)", () => {
  // Estadia: 10/jun/2026 + 84 noites => 10/jun a 01/set (ultima noite).
  // Sobreposicao com 14/jun-23/ago: 14/jun (idx 4) a 23/ago (idx 74) = 71 noites.
  const r = applySeasonalAdjustments({
    startDate: "2026-06-10",
    weeks: 12,
    adjustments: [ALTA],
    proration: "nightly",
  });
  assert.equal(r.lines.length, 1);
  assert.equal(r.lines[0].nights, 71);
  assert.equal(r.lines[0].from, "2026-06-14");
  assert.equal(r.lines[0].to, "2026-08-23");
  assert.equal(r.lines[0].amount, 405.71); // 40 x 71 / 7 = 405.714...
  assert.equal(r.total, 405.71);
});

test("S4: periodo recorrente (sem ano) aplica no ano seguinte", () => {
  const r = applySeasonalAdjustments({
    startDate: "2027-06-20",
    weeks: 1,
    adjustments: [ALTA],
    proration: "nightly",
  });
  assert.equal(r.lines.length, 1);
  assert.equal(r.lines[0].nights, 7);
  assert.equal(r.lines[0].amount, 40);
  assert.equal(r.lines[0].from, "2027-06-20");
});

test("S5: periodo com ano explicito nao aplica em outro ano", () => {
  const comAno: SeasonalAdjustment = {
    name: "Alta temporada 2026",
    amountPerWeek: 115,
    from: { month: 6, day: 26, year: 2026 },
    to: { month: 8, day: 30, year: 2026 },
  };
  const foraDoAno = applySeasonalAdjustments({
    startDate: "2027-07-01",
    weeks: 4,
    adjustments: [comAno],
    proration: "nightly",
  });
  assert.deepEqual(foraDoAno.lines, []);
  assert.equal(foraDoAno.total, 0);

  // No ano correto, aplica normalmente.
  const noAno = applySeasonalAdjustments({
    startDate: "2026-07-01",
    weeks: 2,
    adjustments: [comAno],
    proration: "nightly",
  });
  assert.equal(noAno.lines.length, 1);
  assert.equal(noAno.total, 230); // 2 x 115
});

test("S6: periodo que cruza a virada do ano (15/dez a 10/jan)", () => {
  const virada: SeasonalAdjustment = {
    name: "Natal/Ano Novo",
    amountPerWeek: 50,
    from: { month: 12, day: 15 },
    to: { month: 1, day: 10 },
  };
  // Estadia 28/dez/2026 + 21 noites => 28/dez a 17/jan/2027.
  // Sobreposicao: 28..31/dez (4) + 01..10/jan (10) = 14 noites.
  const r = applySeasonalAdjustments({
    startDate: "2026-12-28",
    weeks: 3,
    adjustments: [virada],
    proration: "nightly",
  });
  assert.equal(r.lines.length, 1);
  assert.equal(r.lines[0].nights, 14);
  assert.equal(r.lines[0].from, "2026-12-28");
  assert.equal(r.lines[0].to, "2027-01-10");
  assert.equal(r.total, 100); // 50 x 14 / 7
});

test("S7: full_week cobra semana cheia (11 blocos) vs nightly proporcional", () => {
  const params = {
    startDate: "2026-06-10",
    weeks: 12,
    adjustments: [ALTA],
  };
  const nightly = applySeasonalAdjustments({ ...params, proration: "nightly" as const });
  const fullWeek = applySeasonalAdjustments({ ...params, proration: "full_week" as const });

  assert.equal(nightly.total, 405.71);
  // Blocos de 7 noites a partir do inicio: 12 blocos (0..11). As noites do
  // periodo vao do indice 4 ao 74, entao os blocos 0..10 sao cobrados.
  assert.equal(fullWeek.lines[0].weeksCharged, 11);
  assert.equal(fullWeek.lines[0].nights, 71);
  assert.equal(fullWeek.total, 440); // 11 x 40
});

test("S8: alta e baixa na mesma estadia geram duas linhas com sinais opostos", () => {
  const baixa: SeasonalAdjustment = {
    name: "Baixa temporada",
    amountPerWeek: -30,
    from: { month: 9, day: 1 },
    to: { month: 9, day: 30 },
  };
  // Estadia 17/ago/2026 + 28 noites => 17/ago a 13/set.
  // Alta: 17..23/ago = 7 noites => +40. Baixa: 01..13/set = 13 noites => -55.71.
  const r = applySeasonalAdjustments({
    startDate: "2026-08-17",
    weeks: 4,
    adjustments: [ALTA, baixa],
    proration: "nightly",
  });
  assert.equal(r.lines.length, 2);
  assert.equal(r.lines[0].name, "Alta temporada");
  assert.equal(r.lines[0].nights, 7);
  assert.equal(r.lines[0].amount, 40);
  assert.equal(r.lines[1].name, "Baixa temporada");
  assert.equal(r.lines[1].nights, 13);
  assert.equal(r.lines[1].amount, -55.71); // -30 x 13 / 7
  assert.equal(r.total, -15.71);
});

test("S9: periodo terminando em 29/fev em ano nao bissexto vira 28/fev", () => {
  const fev: SeasonalAdjustment = {
    name: "Inverno",
    amountPerWeek: 40,
    from: { month: 2, day: 1 },
    to: { month: 2, day: 29 },
  };
  // 2027 nao e bissexto: estadia 20/fev + 14 noites => 20/fev a 05/mar.
  // Sobreposicao: 20..28/fev = 9 noites.
  const r = applySeasonalAdjustments({
    startDate: "2027-02-20",
    weeks: 2,
    adjustments: [fev],
    proration: "nightly",
  });
  assert.equal(r.lines.length, 1);
  assert.equal(r.lines[0].nights, 9);
  assert.equal(r.lines[0].to, "2027-02-28");
  assert.equal(r.lines[0].amount, 51.43); // 40 x 9 / 7 = 51.428...
});

test("S11: duas ocorrencias do mesmo ajuste somam numa linha so", () => {
  const curto: SeasonalAdjustment = {
    name: "Carnaval",
    amountPerWeek: 70,
    from: { month: 3, day: 1 },
    to: { month: 3, day: 3 },
  };
  // Estadia de 53 semanas a partir de 27/fev/2026 cobre mar/2026 e mar/2027.
  const r = applySeasonalAdjustments({
    startDate: "2026-02-27",
    weeks: 53,
    adjustments: [curto],
    proration: "nightly",
  });
  assert.equal(r.lines.length, 1);
  assert.equal(r.lines[0].nights, 6); // 3 + 3
  assert.equal(r.lines[0].from, "2026-03-01");
  assert.equal(r.lines[0].to, "2027-03-03");
  assert.equal(r.lines[0].amount, 60); // 70 x 6 / 7
});

test("S10: priceProduct com e sem ajuste sazonal", () => {
  const base: PriceRequest = {
    product: { currency: "CAD", kind: "accommodation" },
    startDate: "2026-09-07",
    quantity: 10,
    unit: "week",
    templates: [OPEN_TEMPLATE],
    transitionRule: "split_by_period",
    fees: [],
    promotions: [],
    context: PP_CONTEXT,
  };
  const semSazonal = priceProduct(base);
  assert.equal(semSazonal.grossAmount, 5750);
  assert.equal(semSazonal.netAmount, 5750);
  assert.equal(semSazonal.seasonal, undefined);

  const baixa: SeasonalAdjustment = {
    name: "Baixa temporada",
    amountPerWeek: -30,
    from: { month: 9, day: 1 },
    to: { month: 9, day: 30 },
  };
  // 70 noites de 07/set a 15/nov; sobreposicao 07..30/set = 24 noites.
  // -30 x 24 / 7 = -102.857... => -102.86.
  const comSazonal = priceProduct({ ...base, seasonalAdjustments: [baixa] });
  assert.equal(comSazonal.grossAmount, 5750);
  assert.equal(comSazonal.seasonal?.length, 1);
  assert.equal(comSazonal.seasonal?.[0].nights, 24);
  assert.equal(comSazonal.seasonal?.[0].amount, -102.86);
  assert.equal(comSazonal.netAmount, round2(5750 - 102.86));
  assert.equal(comSazonal.netAmount, 5647.14);
  // O item sem ajuste continua identico em tudo o mais.
  assert.equal(comSazonal.averageUnitPrice, semSazonal.averageUnitPrice);
  assert.equal(comSazonal.endDate, semSazonal.endDate);
});

// ── propagacao de is_refundable / feeId (a flag decide a ENTRADA) ───────────
test("applyFees carrega feeId e isRefundable do catalogo ate a linha", () => {
  const ctx: FeeContext = {
    billableQuantity: 4, itemCount: 1, personCount: 1,
    programItemCount: 1, multiCourseRule: "charge_all",
  };
  const r = applyFees(
    [
      { id: "f-1", name: "Matrícula", feeType: "registration", chargeBasis: "once_per_item", amount: 155, currency: "USD", isRefundable: false },
      { id: "f-2", name: "Caução", feeType: "other", chargeBasis: "once_per_item", amount: 200, currency: "USD", isRefundable: true },
      { id: "f-3", name: "Material", feeType: "material", chargeBasis: "once_per_item", amount: 80, currency: "USD" },
    ],
    ctx,
  );
  assert.deepEqual(
    r.fees.map((l) => [l.feeId, l.isRefundable]),
    [["f-1", false], ["f-2", true], ["f-3", undefined]],
    "false, true e desconhecido sao TRES estados distintos",
  );
});

test("combinarReembolsavel nunca inventa `true`", () => {
  // `true` tira a taxa da entrada: so quando TODAS forem reembolsaveis.
  assert.equal(combinarReembolsavel([true, true]), true);
  assert.equal(combinarReembolsavel([true, false]), false);
  assert.equal(combinarReembolsavel([false, undefined]), false, "false vence o desconhecido");
  assert.equal(combinarReembolsavel([true, undefined]), undefined, "desconhecido nao vira true");
  assert.equal(combinarReembolsavel([]), undefined);
});

test("matricula multi-curso combina a flag das taxas que fundiu", () => {
  const ctx: FeeContext = {
    billableQuantity: 4, itemCount: 2, personCount: 1,
    programItemCount: 2, multiCourseRule: "charge_highest",
  };
  const r = applyFees(
    [
      { id: "a", name: "Matrícula A", feeType: "registration", chargeBasis: "once_per_item", amount: 100, currency: "USD", isRefundable: false },
      { id: "b", name: "Matrícula B", feeType: "registration", chargeBasis: "once_per_item", amount: 150, currency: "USD", isRefundable: true },
    ],
    ctx,
  );
  const linha = r.fees.find((l) => l.name.includes("multi-curso"));
  assert.ok(linha);
  assert.equal(linha.feeId, undefined, "linha fundida nao tem uma origem unica");
  assert.equal(linha.isRefundable, false, "uma nao reembolsavel torna a linha nao reembolsavel");
});

// ── Promocoes: faixa fechada, isencao de taxa e semanas gratis ──────────────
// Tres lacunas que so apareceram ao cadastrar o folheto promocional da VanWest:
// a aba de promocoes oferecia seis tipos e o motor implementava dois; nao havia
// TETO de quantidade (so "a partir de"); e as semanas gratis existiam no motor
// mas nada as ligava a tabela de promocoes.
function promoBase_(over: Partial<Promotion> = {}): Promotion {
  return {
    name: "Promo",
    promoType: "percent_off",
    value: 10,
    appliesTo: "tuition",
    isStackable: false,
    priority: 100,
    status: "active",
    targets: [],
    ...over,
  };
}
const CTX_: PromoContext = { quoteDate: "2026-09-22", startDate: "2026-11-02", billableQuantity: 12 };

test("promocao com teto de quantidade nao se aplica acima dele", () => {
  const p = promoBase_({ maxQuantity: 12 });
  assert.equal(isPromotionApplicable(p, { ...CTX_, billableQuantity: 12 }), true); // inclusivo
  assert.equal(isPromotionApplicable(p, { ...CTX_, billableQuantity: 13 }), false);
});

// Sem o teto, duas faixas de preco promocional ("1 a 11 semanas" e "12 a 23")
// se sobrepoem: quem contrata 20 semanas satisfaz as duas.
test("min + max desenham um INTERVALO fechado, sem sobreposicao entre faixas", () => {
  const faixa1 = promoBase_({ name: "1-11", minQuantity: 1, maxQuantity: 11 });
  const faixa2 = promoBase_({ name: "12-23", minQuantity: 12, maxQuantity: 23 });
  const q = (n: number) => ({ ...CTX_, billableQuantity: n });
  assert.deepEqual(
    [8, 12, 30].map((n) => [isPromotionApplicable(faixa1, q(n)), isPromotionApplicable(faixa2, q(n))]),
    [[true, false], [false, true], [false, false]],
  );
});

test("waive_fee isenta UMA taxa pelo id, sem tocar nas demais", () => {
  const bases: PromoBases = {
    tuition: 4680, accommodation: 0, insurance: 0, fees: 415, total: 5095,
    feeAmountById: { material: 240, matricula: 175 },
  };
  const r = applyPromotions(
    [promoBase_({ name: "Material grátis", promoType: "waive_fee", appliesTo: "specific_fee", appliesToRefId: "material" })],
    bases,
    CTX_,
  );
  assert.equal(r.totalDiscount, 240);
  assert.equal(r.discounts[0].appliesTo, "specific_fee");
});

test("waive_fee de taxa que nao entrou na conta nao gera linha", () => {
  const bases: PromoBases = { tuition: 100, accommodation: 0, insurance: 0, fees: 0, total: 100, feeAmountById: {} };
  const r = applyPromotions(
    [promoBase_({ promoType: "waive_fee", appliesTo: "specific_fee", appliesToRefId: "inexistente" })],
    bases,
    CTX_,
  );
  assert.equal(r.discounts.length, 0);
});

// Um fixed_off de 50 sobre uma taxa de 20 viraria credito de 30 para o aluno.
test("desconto nunca passa da propria base", () => {
  const bases: PromoBases = { tuition: 100, accommodation: 0, insurance: 0, fees: 20, total: 120, feeAmountById: { m: 20 } };
  const r = applyPromotions(
    [promoBase_({ promoType: "fixed_off", value: 50, appliesTo: "specific_fee", appliesToRefId: "m" })],
    bases,
    CTX_,
  );
  assert.equal(r.totalDiscount, 20);
});

test("free_units sai da tabela de promocoes; a mais generosa vence o empate", () => {
  const p4 = promoBase_({ name: "4 grátis", promoType: "free_units", value: 4, minQuantity: 24 });
  const p2 = promoBase_({ name: "2 grátis", promoType: "free_units", value: 2, minQuantity: 12 });
  const esc = (ps: Promotion[], n: number) =>
    escolherUnidadesGratuitas(ps, { ...CTX_, billableQuantity: n }, { kind: "program", quantity: n });
  assert.deepEqual(esc([p4, p2], 12)?.freeUnits, { units: 2, semantics: "bonus_on_top" });
  assert.deepEqual(esc([p2, p4], 24)?.freeUnits, { units: 4, semantics: "bonus_on_top" });
  assert.equal(esc([p4, p2], 4), undefined);
});

// As promocoes vem do FORNECEDOR, nao do produto: sem conferir o alvo, "4
// semanas gratis de curso" daria 4 semanas de casa de familia do mesmo campus.
test("free_units de curso nao vaza para a acomodacao do mesmo campus", () => {
  const p = promoBase_({ promoType: "free_units", value: 4, appliesTo: "tuition", minQuantity: 24 });
  const ctx = { ...CTX_, billableQuantity: 24 };
  assert.ok(escolherUnidadesGratuitas([p], ctx, { kind: "program", quantity: 24 }));
  assert.equal(escolherUnidadesGratuitas([p], ctx, { kind: "accommodation", quantity: 24 }), undefined);
});

// Com discount_on_booked, 4 gratis em 2 semanas cobradas dá quantidade -2 e
// valor NEGATIVO — credito para o estudante, sem nenhum aviso.
test("free_units maior que a quantidade contratada e recusada, com aviso", () => {
  const avisos: string[] = [];
  const p = promoBase_({ promoType: "free_units", value: 4, freeUnitsSemantics: "discount_on_booked" });
  const r = escolherUnidadesGratuitas([p], { ...CTX_, billableQuantity: 2 }, { kind: "program", quantity: 2, warnings: avisos });
  assert.equal(r, undefined);
  assert.equal(avisos.length, 1);
});

// is_stackable=false precisa valer TAMBEM entre a promocao de semanas gratis e
// as demais: "4 semanas gratis OU 10% off", nunca os dois.
test("free_units nao empilhavel bloqueia as demais promocoes", () => {
  const bases: PromoBases = { tuition: 1000, accommodation: 0, insurance: 0, fees: 0, total: 1000 };
  const gratis = promoBase_({ id: "g", name: "4 grátis", promoType: "free_units", value: 4, isStackable: false });
  const dez = promoBase_({ id: "d", name: "10% off", promoType: "percent_off", value: 10, isStackable: false });
  assert.equal(applyPromotions([dez], bases, CTX_, [gratis]).discounts.length, 0);
  assert.equal(applyPromotions([dez], bases, CTX_).discounts.length, 1);
});

// Nada limitava a SOMA dos descontos: duas isencoes empilhaveis sobre a mesma
// taxa deixavam o liquido negativo em silencio.
test("soma dos descontos nao passa do valor da cotacao", () => {
  const bases: PromoBases = { tuition: 0, accommodation: 0, insurance: 0, fees: 400, total: 400, feeAmountById: { m: 240 } };
  const r = applyPromotions(
    [
      promoBase_({ id: "a", name: "Todas as taxas", promoType: "waive_fee", appliesTo: "fees", isStackable: true, priority: 1 }),
      promoBase_({ id: "b", name: "Material", promoType: "waive_fee", appliesTo: "specific_fee", appliesToRefId: "m", isStackable: true, priority: 2 }),
    ],
    bases,
    CTX_,
  );
  assert.equal(r.totalDiscount, 400);
  assert.equal(r.warnings.length, 1);
});

test("promocao de semanas gratis chega ao bruto: contrata 24, recebe 28", () => {
  const r = priceProduct({
    product: { currency: "CAD", kind: "program" },
    startDate: "2026-11-02",
    quantity: 24,
    unit: "week",
    templates: [{ name: "ESL 30", tiers: [{ minQuantity: 1, unitPrice: 450 }, { minQuantity: 24, unitPrice: 435 }], validFrom: null, validUntil: null }],
    transitionRule: "split_by_period",
    fees: [],
    promotions: [promoBase_({ name: "4 semanas grátis", promoType: "free_units", value: 4, minQuantity: 24 })],
    context: { quoteDate: "2026-09-22", startDate: "2026-11-02", billableQuantity: 24 },
  });
  assert.equal(r.deliveredQuantity, 28);
  assert.equal(r.billableQuantity, 24);
  assert.equal(r.grossAmount, 24 * 435);
});
