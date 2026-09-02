// Testes do motor puro de validacao de taxa (fee).
// Roda com o runner nativo do Node: `npm test` (node --test), sem dependencias.
import { test } from "node:test";
import assert from "node:assert/strict";
import { validarTaxa, type Falha } from "./fee.ts";

function campos(r: ReturnType<typeof validarTaxa>): string[] {
  return r.ok ? [] : r.falhas.map((f: Falha) => f.campo);
}

function base(over: Record<string, unknown> = {}) {
  return {
    campus_id: "campus-1",
    name: "Taxa de matrícula",
    fee_type: "registration",
    charge_basis: "once_per_quote",
    amount: 150,
    currency: "brl",
    applies_to_kinds: ["program"],
    ...over,
  };
}

test("taxa de valor fixo válida normaliza", () => {
  const r = validarTaxa(base());
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.valor.fee.amount, 150);
  assert.equal(r.valor.fee.currency, "BRL");
  assert.equal(r.valor.fee.price_template_id, null);
  assert.equal(r.valor.fee.is_mandatory, true); // default
  assert.equal(r.valor.fee.is_refundable, false); // default
  assert.deepEqual(r.valor.fee.applies_to_kinds, ["program"]);
});

test("obrigatórios: campus_id, name, fee_type, charge_basis", () => {
  const r = validarTaxa({});
  const c = campos(r);
  for (const campo of ["campus_id", "name", "fee_type", "charge_basis"]) {
    assert.ok(c.includes(campo), `esperava falha em ${campo}`);
  }
});

test("fee_type / charge_basis inválidos falham", () => {
  const r = validarTaxa(base({ fee_type: "imposto", charge_basis: "mensal" }));
  const c = campos(r);
  assert.ok(c.includes("fee_type"));
  assert.ok(c.includes("charge_basis"));
});

test("XOR: valor fixo E tabela juntos falham", () => {
  const r = validarTaxa(base({ price_template_id: "tpl-1" }));
  assert.ok(!r.ok && campos(r).includes("amount"));
});

test("XOR: nem valor fixo nem tabela falha", () => {
  const r = validarTaxa(base({ amount: undefined, currency: undefined }));
  assert.ok(!r.ok && campos(r).includes("amount"));
});

test("valor derivado de tabela (sem amount) é válido; currency não é exigida", () => {
  const r = validarTaxa(base({ amount: undefined, currency: undefined, price_template_id: "tpl-1" }));
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.valor.fee.amount, null);
    assert.equal(r.valor.fee.price_template_id, "tpl-1");
    assert.equal(r.valor.fee.currency, null);
  }
});

test("amount <= 0 falha (dinheiro)", () => {
  assert.ok(!validarTaxa(base({ amount: 0 })).ok);
  assert.ok(!validarTaxa(base({ amount: -10 })).ok);
});

test("valor fixo exige moeda de 3 letras", () => {
  assert.ok(campos(validarTaxa(base({ currency: "R$" }))).includes("currency"));
  assert.ok(campos(validarTaxa(base({ currency: undefined }))).includes("currency"));
  const r = validarTaxa(base({ currency: "usd" }));
  assert.ok(r.ok && r.valor.fee.currency === "USD");
});

test("amount é arredondado para centavos", () => {
  const r = validarTaxa(base({ amount: 99.999 }));
  assert.ok(r.ok && r.valor.fee.amount === 100);
});

test("alvo obrigatório: sem kinds e sem produtos falha", () => {
  const r = validarTaxa(base({ applies_to_kinds: [] }));
  assert.ok(!r.ok && campos(r).includes("applies_to_kinds"));
});

test("alvo por produtos específicos (sem kinds) é válido", () => {
  const r = validarTaxa(base({ applies_to_kinds: [], product_ids: ["p1", "p2"] }));
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual(r.valor.product_ids, ["p1", "p2"]);
});

test("applies_to_kinds inválido falha; válidos deduplicados", () => {
  assert.ok(!validarTaxa(base({ applies_to_kinds: ["program", "curso"] })).ok);
  const r = validarTaxa(base({ applies_to_kinds: ["program", "program", "accommodation"] }));
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual(r.valor.fee.applies_to_kinds, ["program", "accommodation"]);
});

test("is_refundable / is_mandatory respeitados", () => {
  const r = validarTaxa(base({ is_refundable: true, is_mandatory: false }));
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.valor.fee.is_refundable, true);
    assert.equal(r.valor.fee.is_mandatory, false);
  }
});

test("valid_from > valid_until falha", () => {
  assert.ok(campos(validarTaxa(base({ valid_from: "2026-06-01", valid_until: "2026-01-01" }))).includes("valid_until"));
});

test("product_ids deduplicado", () => {
  const r = validarTaxa(base({ product_ids: ["p1", "p1", " p2 "] }));
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual(r.valor.product_ids, ["p1", "p2"]);
});

test("corpo não-objeto falha limpo", () => {
  assert.ok(!validarTaxa(null).ok);
  assert.ok(!validarTaxa([]).ok);
});
