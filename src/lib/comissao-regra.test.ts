import { test } from "node:test";
import assert from "node:assert/strict";
import { resolverRegra, validarRegra, descreverRegra, type RegraArmazenada } from "./comissao-regra.ts";

const PROD = "33333333-3333-4333-8333-333333333333";
const padrao = { basis: "tuition" as const, type: "percent" as const, value: 25, currency: null };
const regra = (o: Partial<RegraArmazenada>): RegraArmazenada => ({
  scope: "kind", kind: "accommodation", product_id: null, commission_basis: "tuition", commission_type: "percent",
  commission_value: 10, currency: null, valid_from: "2026-01-01", valid_until: null, ...o,
});

test("sem regras especificas cai no padrao da escola", () => {
  const r = resolverRegra({ kind: "program", hoje: "2027-01-10", regras: [], padrao });
  assert.equal(r?.origem, "padrao");
  assert.equal(r?.value, 25);
});

test("regra do tipo vence o padrao", () => {
  const r = resolverRegra({ kind: "accommodation", hoje: "2027-01-10", regras: [regra({})], padrao });
  assert.equal(r?.origem, "tipo");
  assert.equal(r?.value, 10);
});

test("regra do produto vence a do tipo", () => {
  const regras = [regra({}), regra({ scope: "product", kind: null, product_id: PROD, commission_value: 5 })];
  const r = resolverRegra({ kind: "accommodation", productId: PROD, hoje: "2027-01-10", regras, padrao });
  assert.equal(r?.origem, "produto");
  assert.equal(r?.value, 5);
  // outro produto do mesmo tipo usa a regra do tipo
  assert.equal(resolverRegra({ kind: "accommodation", productId: "x", hoje: "2027-01-10", regras, padrao })?.origem, "tipo");
});

test("vigencia: regra futura ou vencida e ignorada", () => {
  const futura = regra({ valid_from: "2027-06-01" });
  const vencida = regra({ valid_until: "2026-12-31" });
  assert.equal(resolverRegra({ kind: "accommodation", hoje: "2027-01-10", regras: [futura], padrao })?.origem, "padrao");
  assert.equal(resolverRegra({ kind: "accommodation", hoje: "2027-01-10", regras: [vencida], padrao })?.origem, "padrao");
  assert.equal(resolverRegra({ kind: "accommodation", hoje: "2027-06-01", regras: [futura], padrao })?.origem, "tipo");
});

test("sem regra nem padrao devolve null", () => {
  assert.equal(resolverRegra({ kind: "program", hoje: "2027-01-10", regras: [], padrao: null }), null);
});

test("descrever regra", () => {
  assert.equal(descreverRegra({ basis: "tuition", type: "percent", value: 25, currency: null }), "25% sobre a mensalidade");
  assert.equal(descreverRegra({ basis: "none", type: "percent", value: 0, currency: null }), "sem comissão");
  assert.equal(descreverRegra({ basis: "total", type: "fixed_per_sale", value: 300, currency: "USD" }), "USD 300 por venda");
});

test("validar regra: tipo e produto", () => {
  assert.ok(validarRegra({ scope: "kind", kind: "accommodation", basis: "tuition", type: "percent", value: "10" }).ok);
  assert.ok(validarRegra({ scope: "product", productId: PROD, basis: "total", type: "percent", value: 5 }).ok);
  assert.equal(validarRegra({ scope: "kind", kind: "xx", basis: "tuition", type: "percent", value: 10 }).ok, false);
  assert.equal(validarRegra({ scope: "product", productId: "x", basis: "tuition", type: "percent", value: 10 }).ok, false);
  assert.equal(validarRegra({ scope: "kind", kind: "program", basis: "tuition", type: "percent", value: 150 }).ok, false);
  assert.equal(validarRegra({ scope: "kind", kind: "program", basis: "tuition", type: "percent", value: -1 }).ok, false);
  assert.equal(validarRegra({ scope: "kind", kind: "program", basis: "tuition", type: "fixed_per_sale", value: 100 }).ok, false); // falta moeda
  assert.ok(validarRegra({ scope: "kind", kind: "program", basis: "tuition", type: "fixed_per_sale", value: 100, currency: "usd" }).ok);
});

test("sem comissao zera o valor", () => {
  const r = validarRegra({ scope: "kind", kind: "fee", basis: "none", type: "percent", value: 12 });
  assert.ok(r.ok);
  assert.equal(r.valor.value, 0);
});

test("datas da regra", () => {
  assert.equal(validarRegra({ scope: "kind", kind: "program", basis: "tuition", type: "percent", value: 10, validFrom: "2027-02-31" }).ok, false);
  assert.equal(validarRegra({ scope: "kind", kind: "program", basis: "tuition", type: "percent", value: 10, validFrom: "2027-05-01", validUntil: "2027-04-01" }).ok, false);
});
