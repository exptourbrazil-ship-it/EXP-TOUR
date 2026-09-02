// Testes do motor puro de validacao de tabela de preco (price_template + tiers).
// Roda com o runner nativo do Node: `npm test` (node --test), sem dependencias.
import { test } from "node:test";
import assert from "node:assert/strict";
import { validarTabelaPreco, type Falha } from "./preco-template.ts";

function campos(r: ReturnType<typeof validarTabelaPreco>): string[] {
  return r.ok ? [] : r.falhas.map((f: Falha) => f.campo);
}

// Corpo válido mínimo reutilizável.
function base(over: Record<string, unknown> = {}) {
  return {
    campus_id: "campus-1",
    name: "Tabela 2026",
    price_basis: "duration",
    unit: "week",
    currency: "brl",
    valid_from: "2026-01-01",
    product_ids: ["p1"],
    tiers: [{ min_quantity: 1, unit_price: 100 }],
    ...over,
  };
}

test("tabela válida normaliza template + tiers + product_ids", () => {
  const r = validarTabelaPreco(base());
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.valor.template.name, "Tabela 2026");
  assert.equal(r.valor.template.currency, "BRL"); // uppercase
  assert.equal(r.valor.template.duration_type, "flexible"); // default
  assert.equal(r.valor.template.status, "draft"); // default
  assert.equal(r.valor.template.charge_in_tiers, false); // default
  assert.deepEqual(r.valor.product_ids, ["p1"]);
  assert.equal(r.valor.tiers.length, 1);
  assert.equal(r.valor.tiers[0].sort, 0);
});

test("obrigatórios: campus_id, name, price_basis, unit, currency, valid_from", () => {
  const r = validarTabelaPreco({});
  const c = campos(r);
  for (const campo of ["campus_id", "name", "price_basis", "unit", "currency", "valid_from"]) {
    assert.ok(c.includes(campo), `esperava falha em ${campo}`);
  }
});

test("price_basis / duration_type / status inválidos falham", () => {
  const r = validarTabelaPreco(base({ price_basis: "custo", duration_type: "sazonal", status: "publicado" }));
  const c = campos(r);
  assert.ok(c.includes("price_basis"));
  assert.ok(c.includes("duration_type"));
  assert.ok(c.includes("status"));
});

test("currency deve ter 3 letras", () => {
  assert.ok(!validarTabelaPreco(base({ currency: "R$" })).ok);
  assert.ok(!validarTabelaPreco(base({ currency: "REAL" })).ok);
  const r = validarTabelaPreco(base({ currency: "usd" }));
  assert.ok(r.ok && r.valor.template.currency === "USD");
});

test("min_quantity > max_quantity falha; valid_from > valid_until falha", () => {
  assert.ok(campos(validarTabelaPreco(base({ min_quantity: 10, max_quantity: 2 }))).includes("max_quantity"));
  assert.ok(campos(validarTabelaPreco(base({ valid_until: "2025-06-01" }))).includes("valid_until"));
});

test("valid_until >= valid_from é aceito; datas inválidas falham", () => {
  assert.ok(validarTabelaPreco(base({ valid_until: "2026-12-31" })).ok);
  assert.ok(campos(validarTabelaPreco(base({ valid_from: "2026-13-01" }))).includes("valid_from"));
});

test("product_ids obrigatório (ao menos um) e deduplicado", () => {
  assert.ok(campos(validarTabelaPreco(base({ product_ids: [] }))).includes("product_ids"));
  const r = validarTabelaPreco(base({ product_ids: ["p1", "p1", " p2 ", ""] }));
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual(r.valor.product_ids, ["p1", "p2"]);
});

test("tiers: ao menos uma faixa", () => {
  assert.ok(campos(validarTabelaPreco(base({ tiers: [] }))).includes("tiers"));
});

test("tier com unit_price <= 0 falha (dinheiro)", () => {
  assert.ok(campos(validarTabelaPreco(base({ tiers: [{ min_quantity: 1, unit_price: 0 }] }))).some((c) => c.startsWith("tiers[0].unit_price")));
  assert.ok(campos(validarTabelaPreco(base({ tiers: [{ min_quantity: 1, unit_price: -5 }] }))).some((c) => c.startsWith("tiers[0].unit_price")));
});

test("min_quantity duplicado entre faixas falha", () => {
  const r = validarTabelaPreco(base({ tiers: [{ min_quantity: 1, unit_price: 100 }, { min_quantity: 1, unit_price: 90 }] }));
  assert.ok(!r.ok && campos(r).some((c) => c.includes("min_quantity")));
});

test("faixas são ordenadas por min_quantity e reindexadas (sort)", () => {
  const r = validarTabelaPreco(base({
    tiers: [
      { min_quantity: 12, unit_price: 80 },
      { min_quantity: 1, unit_price: 100 },
      { min_quantity: 4, unit_price: 90 },
    ],
  }));
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.deepEqual(r.valor.tiers.map((t) => t.min_quantity), [1, 4, 12]);
  assert.deepEqual(r.valor.tiers.map((t) => t.sort), [0, 1, 2]);
});

test("unit_price é arredondado para centavos", () => {
  const r = validarTabelaPreco(base({ tiers: [{ min_quantity: 1, unit_price: 99.999 }] }));
  assert.ok(r.ok && r.valor.tiers[0].unit_price === 100);
});

test("charge_in_tiers e market_id são preservados", () => {
  const r = validarTabelaPreco(base({ charge_in_tiers: true, market_id: "mkt-1" }));
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.valor.template.charge_in_tiers, true);
    assert.equal(r.valor.template.market_id, "mkt-1");
  }
});

test("corpo não-objeto falha limpo", () => {
  assert.ok(!validarTabelaPreco(null).ok);
  assert.ok(!validarTabelaPreco([]).ok);
});
