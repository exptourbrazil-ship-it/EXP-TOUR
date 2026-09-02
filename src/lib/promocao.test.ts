// Testes do motor puro de validacao de promocao.
// Roda com o runner nativo do Node: `npm test` (node --test), sem dependencias.
import { test } from "node:test";
import assert from "node:assert/strict";
import { validarPromocao, type Falha } from "./promocao.ts";

function campos(r: ReturnType<typeof validarPromocao>): string[] {
  return r.ok ? [] : r.falhas.map((f: Falha) => f.campo);
}

function base(over: Record<string, unknown> = {}) {
  return {
    supplier_id: "sup-1",
    name: "Early bird",
    promo_type: "percent_off",
    value: 10,
    applies_to: "tuition",
    ...over,
  };
}

test("percent_off válido normaliza", () => {
  const r = validarPromocao(base());
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.valor.promotion.promo_type, "percent_off");
  assert.equal(r.valor.promotion.value, 10);
  assert.equal(r.valor.promotion.is_stackable, false); // default
  assert.equal(r.valor.promotion.priority, 100); // default
  assert.equal(r.valor.promotion.status, "draft"); // default
  assert.equal(r.valor.promotion.applies_to_ref_id, null);
});

test("obrigatórios: supplier_id, name, promo_type, applies_to", () => {
  const r = validarPromocao({});
  const c = campos(r);
  for (const campo of ["supplier_id", "name", "promo_type", "applies_to"]) {
    assert.ok(c.includes(campo), `esperava falha em ${campo}`);
  }
});

test("promo_type / applies_to inválidos falham", () => {
  const r = validarPromocao(base({ promo_type: "brinde", applies_to: "qualquer" }));
  const c = campos(r);
  assert.ok(c.includes("promo_type"));
  assert.ok(c.includes("applies_to"));
});

test("percent_off exige value > 0 e <= 100", () => {
  assert.ok(campos(validarPromocao(base({ value: 0 }))).includes("value"));
  assert.ok(campos(validarPromocao(base({ value: 120 }))).includes("value"));
  assert.ok(campos(validarPromocao(base({ value: undefined }))).includes("value"));
});

test("fixed_off exige value > 0 (sem teto de 100)", () => {
  const r = validarPromocao(base({ promo_type: "fixed_off", value: 500 }));
  assert.ok(r.ok && r.valor.promotion.value === 500);
});

test("waive_fee / free_product não exigem value (normalizado a null)", () => {
  const r1 = validarPromocao(base({ promo_type: "waive_fee", applies_to: "specific_fee", applies_to_ref_id: "fee-1", value: undefined }));
  assert.ok(r1.ok && r1.valor.promotion.value === null);
  const r2 = validarPromocao(base({ promo_type: "free_product", applies_to: "specific_product", applies_to_ref_id: "prod-1", value: undefined }));
  assert.ok(r2.ok && r2.valor.promotion.value === null);
});

test("free_units exige free_units_semantics", () => {
  assert.ok(campos(validarPromocao(base({ promo_type: "free_units", value: 2 }))).includes("free_units_semantics"));
  const r = validarPromocao(base({ promo_type: "free_units", value: 2, free_units_semantics: "bonus_on_top" }));
  assert.ok(r.ok && r.valor.promotion.free_units_semantics === "bonus_on_top");
});

test("applies_to específico exige applies_to_ref_id", () => {
  assert.ok(campos(validarPromocao(base({ applies_to: "specific_fee" }))).includes("applies_to_ref_id"));
  assert.ok(campos(validarPromocao(base({ applies_to: "specific_product" }))).includes("applies_to_ref_id"));
  const r = validarPromocao(base({ applies_to: "specific_fee", applies_to_ref_id: "fee-1" }));
  assert.ok(r.ok && r.valor.promotion.applies_to_ref_id === "fee-1");
});

test("ref_id é descartado quando applies_to não é específico", () => {
  const r = validarPromocao(base({ applies_to: "tuition", applies_to_ref_id: "algo" }));
  assert.ok(r.ok && r.valor.promotion.applies_to_ref_id === null);
});

test("value arredondado a 4 casas; max_discount_amount a 2", () => {
  const r = validarPromocao(base({ promo_type: "fixed_off", value: 12.34567, max_discount_amount: 99.999 }));
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.valor.promotion.value, 12.3457);
    assert.equal(r.valor.promotion.max_discount_amount, 100);
  }
});

test("janelas: booking_from > booking_until e travel_from > travel_until falham", () => {
  assert.ok(campos(validarPromocao(base({ booking_from: "2026-06-01", booking_until: "2026-01-01" }))).includes("booking_until"));
  assert.ok(campos(validarPromocao(base({ travel_from: "2026-06-01", travel_until: "2026-01-01" }))).includes("travel_until"));
});

test("targets: dimensão inválida e valor vazio falham; válidos deduplicados", () => {
  const bad = validarPromocao(base({ targets: [{ dimension: "signo", value: "x" }, { dimension: "market", value: "" }] }));
  const c = campos(bad);
  assert.ok(c.some((x) => x.includes("dimension")));
  assert.ok(c.some((x) => x.includes("value")));

  const ok = validarPromocao(base({ targets: [{ dimension: "nationality", value: "BR" }, { dimension: "nationality", value: "BR" }, { dimension: "market", value: "latam" }] }));
  assert.ok(ok.ok);
  if (ok.ok) assert.equal(ok.valor.targets.length, 2);
});

test("campus_id opcional (null quando ausente); is_stackable/priority respeitados", () => {
  const r = validarPromocao(base({ campus_id: "campus-1", is_stackable: true, priority: 5 }));
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.valor.promotion.campus_id, "campus-1");
    assert.equal(r.valor.promotion.is_stackable, true);
    assert.equal(r.valor.promotion.priority, 5);
  }
  const semCampus = validarPromocao(base());
  assert.ok(semCampus.ok && semCampus.valor.promotion.campus_id === null);
});

test("corpo não-objeto falha limpo", () => {
  assert.ok(!validarPromocao(null).ok);
  assert.ok(!validarPromocao([]).ok);
});
