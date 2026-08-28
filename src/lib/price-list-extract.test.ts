// Testes do normalizador puro do price list extraido.
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizarPriceListExtraido, contarItens } from "./price-list-extract.ts";

test("normaliza cursos: faixas coeridas, ordenadas e deduplicadas; unidade default week", () => {
  const p = normalizarPriceListExtraido({
    currency: "cad",
    programs: [
      {
        name: "  General English  ",
        educationType: "general_english",
        unit: "WEEK",
        tiers: [
          { minQuantity: "12", unitPrice: "380" },
          { minQuantity: 1, unitPrice: 420 },
          { minQuantity: 1, unitPrice: 400 }, // dup de min=1 -> mantem o ultimo (400)
          { minQuantity: "x", unitPrice: 500 }, // invalido -> descartado
        ],
      },
      { name: "", tiers: [] }, // sem nome -> descartado
    ],
  });
  assert.equal(p.currency, "CAD");
  assert.equal(p.programs.length, 1);
  const prog = p.programs[0];
  assert.equal(prog.name, "General English");
  assert.equal(prog.unit, "week");
  assert.deepEqual(prog.tiers, [
    { minQuantity: 1, unitPrice: 400 },
    { minQuantity: 12, unitPrice: 380 },
  ]);
});

test("acomodacoes: tipo validado contra whitelist; unidade default", () => {
  const p = normalizarPriceListExtraido({
    accommodations: [
      { name: "Homestay Standard", type: "homestay", unit: "week", tiers: [{ minQuantity: 1, unitPrice: 250 }] },
      { name: "Palacio", type: "castelo", tiers: [] }, // tipo invalido -> null; sem tiers ok (fica vazio)
    ],
  });
  assert.equal(p.accommodations.length, 2);
  assert.equal(p.accommodations[0].type, "homestay");
  assert.equal(p.accommodations[1].type, null);
  assert.equal(p.accommodations[1].unit, "week");
});

test("taxas: amount obrigatorio > 0; feeType/basis validados; refundable coerido", () => {
  const p = normalizarPriceListExtraido({
    fees: [
      { name: "Registration", feeType: "registration", amount: "150", basis: "once_per_quote", refundable: "no" },
      { name: "Zero", amount: 0 }, // amount 0 -> descartado
      { name: "Lixo", feeType: "mistico", amount: 90, basis: "sei la" }, // feeType/basis -> null
    ],
  });
  assert.equal(p.fees.length, 2);
  assert.deepEqual(p.fees[0], { name: "Registration", feeType: "registration", amount: 150, basis: "once_per_quote", refundable: false });
  assert.equal(p.fees[1].feeType, null);
  assert.equal(p.fees[1].basis, null);
});

test("entrada vazia/invalida vira estrutura vazia; contarItens soma tudo", () => {
  const vazio = normalizarPriceListExtraido(null);
  assert.deepEqual(vazio, { currency: null, programs: [], accommodations: [], fees: [], notes: null });
  assert.equal(contarItens(vazio), 0);

  const cheio = normalizarPriceListExtraido({
    programs: [{ name: "A", tiers: [{ minQuantity: 1, unitPrice: 10 }] }],
    accommodations: [{ name: "B", tiers: [] }],
    fees: [{ name: "C", amount: 5 }],
  });
  assert.equal(contarItens(cheio), 3);
});

test("moeda invalida -> null (a escola preenche depois)", () => {
  assert.equal(normalizarPriceListExtraido({ currency: "dolar" }).currency, null);
  assert.equal(normalizarPriceListExtraido({ currency: "US" }).currency, null);
  assert.equal(normalizarPriceListExtraido({ currency: "usd" }).currency, "USD");
});
