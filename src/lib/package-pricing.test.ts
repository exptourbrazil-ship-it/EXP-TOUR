// Suite da precificacao de PACOTE "sum_of_items" (motor puro, sem rede/DB).
// Escrita ANTES da implementacao. Os numeros sao de papel:
//   General English (GE): faixas 1+ = 200/sem, 13+ = 190/sem
//   English for X (EfX):  faixa  1+ = 60/sem
//   10 semanas: GE 2.000,00 + EfX 600,00 = 2.600,00
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ErroPacote,
  deduplicarTaxasEntreItens,
  precificarPacoteSomaDeItens,
  type ItemPacoteEntrada,
} from "./package-pricing.ts";
import type { Fee, PriceRequest, Promotion } from "./pricing.ts";

const INICIO = "2026-09-07";

function pedido(over: Partial<PriceRequest> & { quantity: number }): PriceRequest {
  return {
    product: { currency: "EUR", kind: "program" },
    startDate: INICIO,
    unit: "week",
    templates: [{ tiers: [{ minQuantity: 1, unitPrice: 200 }, { minQuantity: 13, unitPrice: 190 }] }],
    transitionRule: "use_start_date_price",
    chargeInTiers: false,
    fees: [],
    feeContext: { multiCourseRule: "charge_highest" },
    promotions: [],
    context: { quoteDate: "2026-06-01", startDate: INICIO, billableQuantity: over.quantity },
    ...over,
  };
}

const MATRICULA: Fee = {
  id: "fee-reg", name: "Matricula", feeType: "registration", chargeBasis: "once_per_quote",
  amount: 100, currency: "EUR", isRefundable: false,
};

function itens(qtd: number, feesGE: Fee[] = [], feesEfx: Fee[] = []): ItemPacoteEntrada[] {
  return [
    { itemProductId: "p-ge", name: "General English 20", quantityFactor: 1, request: pedido({ quantity: qtd, fees: feesGE }) },
    {
      itemProductId: "p-efx", name: "English for Business", quantityFactor: 1,
      request: pedido({ quantity: qtd, templates: [{ tiers: [{ minQuantity: 1, unitPrice: 60 }] }], fees: feesEfx }),
    },
  ];
}

const base = {
  packageName: "General English 20 + English for Business",
  quantity: 10,
  startDate: INICIO,
  unit: "week",
  multiCourseRule: "charge_highest" as const,
};

test("soma o bruto de cada item (cada um pela sua tabela) e identifica a origem", () => {
  const r = precificarPacoteSomaDeItens({ ...base, items: itens(10) });
  assert.equal(r.grossAmount, 2600);
  assert.equal(r.netAmount, 2600);
  assert.equal(r.currency, "EUR");
  assert.equal(r.billableQuantity, 10);
  assert.equal(r.deliveredQuantity, 10);
  assert.equal(r.averageUnitPrice, 260);
  assert.equal(r.endDate, "2026-11-16");
  const b = r.breakdown as { source: string; items: { productId: string; name: string; grossAmount: number; quantity: number }[] };
  assert.equal(b.source, "package_sum_of_items");
  assert.deepEqual(
    b.items.map((i) => [i.productId, i.name, i.quantity, i.grossAmount]),
    [["p-ge", "General English 20", 10, 2000], ["p-efx", "English for Business", 10, 600]],
  );
});

test("a faixa de cada item vale pela quantidade TOTAL do pacote (13 sem. entra na faixa de 190)", () => {
  const r = precificarPacoteSomaDeItens({ ...base, quantity: 13, items: itens(13) });
  // GE 13 x 190 = 2.470 ; EfX 13 x 60 = 780
  assert.equal(r.grossAmount, 3250);
});

test("matricula once_per_quote do mesmo fee.id e cobrada UMA vez", () => {
  const r = precificarPacoteSomaDeItens({ ...base, items: itens(10, [MATRICULA], [MATRICULA]) });
  assert.equal(r.fees.length, 1);
  assert.equal(r.fees[0].amount, 100);
  assert.equal(r.netAmount, 2700);
});

test("matriculas de fee.id diferentes seguem multi_course_fee_rule", () => {
  const outra: Fee = { ...MATRICULA, id: "fee-reg-2", amount: 40 };
  const casos: [typeof base.multiCourseRule, number][] = [
    ["charge_highest", 100],
    ["charge_lowest", 40],
    ["charge_all", 140],
  ];
  for (const [regra, esperado] of casos) {
    const r = precificarPacoteSomaDeItens({ ...base, multiCourseRule: regra, items: itens(10, [MATRICULA], [outra]) });
    const soma = r.fees.reduce((s, f) => s + f.amount, 0);
    assert.equal(soma, esperado, regra);
    assert.equal(r.netAmount, 2600 + esperado, regra);
  }
});

test("taxa por unidade fica por item e o nome identifica o item de origem", () => {
  const material: Fee = { id: "fee-mat", name: "Material", feeType: "material", chargeBasis: "per_unit", amount: 5, currency: "EUR" };
  const r = precificarPacoteSomaDeItens({ ...base, items: itens(10, [material], [material]) });
  assert.equal(r.fees.length, 2);
  assert.deepEqual(r.fees.map((f) => f.amount), [50, 50]);
  assert.ok(r.fees[0].name.includes("General English 20"));
  assert.ok(r.fees[1].name.includes("English for Business"));
  assert.equal(r.netAmount, 2700);
});

test("isencao de matricula acompanha a taxa que sobrou (nao some nem desconta taxa descartada)", () => {
  const isencao: Promotion = {
    id: "promo-reg", name: "Matricula gratis", promoType: "waive_fee", appliesTo: "specific_fee",
    appliesToRefId: "fee-reg", isStackable: true, priority: 1, status: "active",
    targets: [],
  };
  const its = itens(10, [MATRICULA], [MATRICULA]).map((i) => ({
    ...i, request: { ...i.request, promotions: [isencao] },
  }));
  const r = precificarPacoteSomaDeItens({ ...base, items: its });
  const descontos = r.discounts.reduce((s, d) => s + d.amount, 0);
  // 1 matricula cobrada (100) e 1 isencao (100): liquido = bruto
  assert.equal(descontos, 100);
  assert.equal(r.netAmount, 2600);
});

test("item sem preco recusa o pacote inteiro dizendo qual item", () => {
  const its = itens(10);
  its[1].request = { ...its[1].request, templates: [] };
  assert.throws(
    () => precificarPacoteSomaDeItens({ ...base, items: its }),
    /English for Business.*sem pre/s,
  );
});

test("pacote sem itens obrigatorios e recusado", () => {
  assert.throws(() => precificarPacoteSomaDeItens({ ...base, items: [] }), /nao tem itens/);
});

test("itens em moedas diferentes sao recusados", () => {
  const its = itens(10);
  its[1].request = { ...its[1].request, product: { currency: "GBP", kind: "program" } };
  assert.throws(() => precificarPacoteSomaDeItens({ ...base, items: its }), /moedas diferentes/);
});

test("fator de quantidade do item multiplica a quantidade do pacote", () => {
  // O chamador monta o request com a quantidade ja multiplicada; o motor
  // confere que ela bate (pacote x fator) e recusa se divergir.
  const its = itens(10);
  its[0] = { ...its[0], quantityFactor: 2 };
  assert.throws(() => precificarPacoteSomaDeItens({ ...base, items: its }), /quantidade/i);
});

test("aviso de duracao fora da faixa do item aparece com o nome do item", () => {
  const its = itens(10);
  its[0].request = { ...its[0].request, product: { currency: "EUR", kind: "program", maxDuration: 8 } };
  const r = precificarPacoteSomaDeItens({ ...base, items: its });
  assert.ok(r.warnings.some((w) => w.includes("General English 20") && w.includes("duracao maxima")));
});

test("avisos de carregamento do item (ex.: sazonal) viajam com o nome do item", () => {
  const its = itens(10);
  its[1] = { ...its[1], extraWarnings: ["Ajuste X em moeda diferente"] };
  const r = precificarPacoteSomaDeItens({ ...base, items: its });
  assert.ok(r.warnings.some((w) => w.includes("English for Business") && w.includes("Ajuste X")));
});

test("taxas do proprio pacote entram no primeiro item", () => {
  const taxaPacote: Fee = { id: "fee-pkg", name: "Taxa pacote", feeType: "service", chargeBasis: "once_per_quote", amount: 30, currency: "EUR" };
  const r = precificarPacoteSomaDeItens({ ...base, items: itens(10), packageFees: [taxaPacote] });
  assert.equal(r.fees.length, 1);
  assert.equal(r.netAmount, 2630);
});

test("deduplicarTaxasEntreItens: nao muta a entrada e mantem a ordem", () => {
  const entrada = [[MATRICULA], [MATRICULA]];
  const saida = deduplicarTaxasEntreItens(entrada, "charge_highest");
  assert.equal(saida[0].length, 1);
  assert.equal(saida[1].length, 0);
  assert.equal(entrada[1].length, 1);
});

test("arredondamento por linha: total = soma das linhas arredondadas", () => {
  const its = itens(10);
  its[0].request = { ...its[0].request, templates: [{ tiers: [{ minQuantity: 1, unitPrice: 33.335 }] }] };
  its[1].request = { ...its[1].request, templates: [{ tiers: [{ minQuantity: 1, unitPrice: 33.335 }] }] };
  const r = precificarPacoteSomaDeItens({ ...base, items: its });
  const b = r.breakdown as { items: { grossAmount: number }[] };
  const soma = Math.round(b.items.reduce((s, i) => s + i.grossAmount * 100, 0)) / 100;
  assert.equal(r.grossAmount, soma);
});

// ---------------------------------------------------------------------------
// Taxas PROPRIAS do pacote x taxas dos itens (dado real: BELS Malta)
// ---------------------------------------------------------------------------
const f = (id: string, feeType: string, chargeBasis: Fee["chargeBasis"], amount: number): Fee => ({
  id, name: `${feeType}-${id}`, feeType, chargeBasis, amount, currency: "EUR",
});

test("taxa propria do pacote SUBSTITUI matricula e material dos itens; service nao e suprimida (BELS)", () => {
  const doItem = (n: string, svc: number) => [
    f(`m${n}`, "registration", "once_per_item", 55),
    f(`t${n}`, "material", "once_per_item", 35),
    f(`s${n}`, "service", "once_per_item", svc),
  ];
  const pacote = [
    f("pm", "registration", "once_per_quote", 55),
    f("pt", "material", "once_per_quote", 35),
    f("sv", "service", "once_per_quote", 20),
  ];
  const r = precificarPacoteSomaDeItens({ ...base, items: itens(10, doItem("a", 10), doItem("b", 15)), packageFees: pacote });
  assert.equal(r.fees.length, 5);
  assert.equal(r.fees.reduce((s, x) => s + x.amount, 0), 55 + 35 + 20 + 10 + 15);
  // O consultor ve o que foi suprimido (nome e valor).
  const aviso = r.warnings.find((w) => w.includes("suprimid"));
  assert.ok(aviso && aviso.includes("registration-ma") && aviso.includes("35") && aviso.includes("material-tb"));
});

test("taxa do pacote com valor 0 nao suprime a cobranca dos itens", () => {
  const r = precificarPacoteSomaDeItens({
    ...base,
    items: itens(10, [f("ma", "registration", "once_per_item", 55)], []),
    packageFees: [f("pm", "registration", "once_per_quote", 0)],
  });
  assert.equal(r.fees.reduce((s, x) => s + x.amount, 0), 55);
  assert.ok(!r.warnings.some((w) => w.includes("suprimid")));
});

test("so registration e material sao suprimidos por tipo; service e courier seguem so o dedupe por id", () => {
  const r = precificarPacoteSomaDeItens({
    ...base,
    items: itens(10, [f("ca", "courier", "once_per_item", 30)], []),
    packageFees: [f("cp", "courier", "once_per_quote", 30)],
  });
  assert.equal(r.fees.reduce((s, x) => s + x.amount, 0), 60);
});

test("taxa de moeda diferente da dos produtos recusa o pacote", () => {
  const usd = { ...f("u", "service", "once_per_quote", 10), currency: "USD" };
  assert.throws(() => precificarPacoteSomaDeItens({ ...base, items: itens(10), packageFees: [usd] }), /moeda/i);
  assert.throws(() => precificarPacoteSomaDeItens({ ...base, items: itens(10, [usd]) }), /moeda/i);
});

test("taxa opcional escolhida num item nao e suprimida pela taxa propria do pacote", () => {
  const escolhida = f("mx", "material", "once_per_item", 12);
  const its = itens(10, [escolhida, f("t2", "material", "once_per_item", 35)]);
  its[0] = { ...its[0], chosenFeeIds: ["mx"] };
  const r = precificarPacoteSomaDeItens({ ...base, items: its, packageFees: [f("pt", "material", "once_per_quote", 35)] });
  // 35 do pacote + 12 escolhida (a 35 do item foi suprimida)
  assert.equal(r.fees.reduce((s, x) => s + x.amount, 0), 47);
});

test("erros do pacote sao ErroPacote (mensagem segura para a tela)", () => {
  assert.throws(() => precificarPacoteSomaDeItens({ ...base, items: [] }), (e) => e instanceof ErroPacote);
});

test("fee_type sem taxa propria do pacote: itens mantem as suas (material por item)", () => {
  const doItem = (n: string) => [f(`t${n}`, "material", "once_per_item", 35)];
  const r = precificarPacoteSomaDeItens({
    ...base, items: itens(10, doItem("a"), doItem("b")), packageFees: [f("pm", "registration", "once_per_quote", 55)],
  });
  assert.equal(r.fees.reduce((s, x) => s + x.amount, 0), 55 + 70);
});

test("matriculas dos itens de QUALQUER charge_basis entram na regra multi-curso", () => {
  const a = [f("ma", "registration", "once_per_item", 55)];
  const b = [f("mb", "registration", "once_per_item", 55)];
  const mista = [f("mb", "registration", "once_per_quote", 40)];
  for (const [regra, esperado] of [["charge_highest", 55], ["charge_lowest", 40], ["charge_all", 95]] as const) {
    const r = precificarPacoteSomaDeItens({ ...base, multiCourseRule: regra, items: itens(10, a, mista) });
    assert.equal(r.fees.reduce((s, x) => s + x.amount, 0), esperado, regra);
  }
  const r = precificarPacoteSomaDeItens({ ...base, items: itens(10, a, b) });
  assert.equal(r.fees.reduce((s, x) => s + x.amount, 0), 55);
});

test("taxa do pacote com o mesmo fee.id repetido entra uma vez so (qualquer basis)", () => {
  const dup = f("x", "service", "per_unit", 2);
  const r = precificarPacoteSomaDeItens({ ...base, items: itens(10), packageFees: [dup, dup] });
  assert.equal(r.fees.length, 1);
  assert.equal(r.fees[0].amount, 20);
});

// ---------------------------------------------------------------------------
// Promocoes que nao podem multiplicar pelo numero de itens
// ---------------------------------------------------------------------------
const promo = (over: Partial<Promotion>): Promotion => ({
  id: "pr", name: "Promo", promoType: "percent_off", appliesTo: "tuition", value: 10,
  isStackable: true, priority: 1, status: "active", targets: [], ...over,
});
const comPromo = (p: Promotion) =>
  itens(10).map((i) => ({ ...i, request: { ...i.request, promotions: [p] } }));
const totalDesc = (r: { discounts: { amount: number }[] }) => r.discounts.reduce((s, d) => s + d.amount, 0);

test("fixed_off vale UMA vez no pacote (nao por item)", () => {
  const r = precificarPacoteSomaDeItens({ ...base, items: comPromo(promo({ promoType: "fixed_off", value: 50 })) });
  assert.equal(totalDesc(r), 50);
  assert.equal(r.netAmount, 2550);
});

test("teto max_discount_amount vale UMA vez no pacote", () => {
  const r = precificarPacoteSomaDeItens({ ...base, items: comPromo(promo({ value: 50, maxDiscountAmount: 100 })) });
  // 50% de 2.000 = 1.000 -> teto 100 (so no primeiro item)
  assert.equal(totalDesc(r), 100);
});

test("promocao nao empilhavel entra uma vez so", () => {
  const r = precificarPacoteSomaDeItens({ ...base, items: comPromo(promo({ isStackable: false })) });
  assert.equal(r.discounts.length, 1);
  assert.equal(totalDesc(r), 200);
});

test("percentual empilhavel segue item a item", () => {
  const r = precificarPacoteSomaDeItens({ ...base, items: comPromo(promo({})) });
  assert.equal(totalDesc(r), 200 + 60);
});

test("promocao restrita que nao se aplica ao 1o item vale no primeiro que a aceita", () => {
  const p = promo({ promoType: "fixed_off", value: 50, targets: [{ dimension: "product", value: "p-efx" }] });
  const its = comPromo(p);
  its[0].request = { ...its[0].request, context: { ...its[0].request.context, productId: "p-ge" } };
  its[1].request = { ...its[1].request, context: { ...its[1].request.context, productId: "p-efx" } };
  const r = precificarPacoteSomaDeItens({ ...base, items: its });
  assert.equal(totalDesc(r), 50);
});

test("quantidade fracionada de item em semanas e recusada", () => {
  const its = itens(10);
  its[0] = { ...its[0], quantityFactor: 1.5, request: { ...its[0].request, quantity: 15 } };
  // 10 x 1.5 = 15 (inteiro): ok. Com pacote de 5 semanas, 7.5 nao e semana fechada.
  const its2 = itens(5).map((i) => ({ ...i, quantityFactor: 1.5, request: { ...i.request, quantity: 7.5 } }));
  assert.throws(() => precificarPacoteSomaDeItens({ ...base, quantity: 5, items: its2 }), /semanas inteiras/);
});
