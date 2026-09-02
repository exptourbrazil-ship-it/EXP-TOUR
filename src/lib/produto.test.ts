// Testes do motor puro de validacao/normalizacao de produto (admin write).
// Roda com o runner nativo do Node: `npm test` (node --test), sem dependencias.
import { test } from "node:test";
import assert from "node:assert/strict";
import { validarProduto, type Falha } from "./produto.ts";

// Helper: extrai os campos que falharam de um resultado invalido.
function camposFalha(r: ReturnType<typeof validarProduto>): string[] {
  if (r.ok) return [];
  return r.falhas.map((f: Falha) => f.campo);
}

test("programa válido normaliza core + detalhe program", () => {
  const r = validarProduto({
    kind: "program",
    name: "  General English  ",
    campus_id: "campus-1",
    visibility: "quotable",
    status: "active",
    min_duration: 1,
    max_duration: 52,
    default_unit: "week",
    detail: { language: "en", delivery_method: "in_person", lessons_per_week: 20, hours_per_week: 15 },
  });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.valor.core.name, "General English"); // trim
  assert.equal(r.valor.core.kind, "program");
  assert.equal(r.valor.core.visibility, "quotable");
  assert.equal(r.valor.campus_id, "campus-1");
  assert.equal(r.valor.detalhe.kind, "program");
  if (r.valor.detalhe.kind === "program") {
    assert.equal(r.valor.detalhe.program.delivery_method, "in_person");
    assert.equal(r.valor.detalhe.program.lessons_per_week, 20);
  }
});

test("defaults: source=internal, visibility=internal, status=draft, unit=week", () => {
  const r = validarProduto({ kind: "program", name: "X", campus_id: "c" });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.valor.core.source, "internal");
  assert.equal(r.valor.core.visibility, "internal");
  assert.equal(r.valor.core.status, "draft");
  assert.equal(r.valor.core.default_unit, "week");
  assert.deepEqual(r.valor.core.attributes, {});
});

test("name obrigatório: vazio/whitespace falha", () => {
  const r1 = validarProduto({ kind: "program", name: "   ", campus_id: "c" });
  assert.ok(!r1.ok && camposFalha(r1).includes("name"));
  const r2 = validarProduto({ kind: "program", campus_id: "c" });
  assert.ok(!r2.ok && camposFalha(r2).includes("name"));
});

test("kind e campus_id obrigatórios", () => {
  const r = validarProduto({ name: "X" });
  assert.ok(!r.ok);
  const c = camposFalha(r);
  assert.ok(c.includes("kind"));
  assert.ok(c.includes("campus_id"));
});

test("kind inválido falha", () => {
  const r = validarProduto({ kind: "curso", name: "X", campus_id: "c" });
  assert.ok(!r.ok && camposFalha(r).includes("kind"));
});

test("enums de core inválidos falham (source/visibility/status/default_unit)", () => {
  const r = validarProduto({
    kind: "program", name: "X", campus_id: "c",
    source: "externo", visibility: "publico", status: "ligado", default_unit: "semana",
  });
  assert.ok(!r.ok);
  const c = camposFalha(r);
  assert.ok(c.includes("source"));
  assert.ok(c.includes("visibility"));
  assert.ok(c.includes("status"));
  assert.ok(c.includes("default_unit"));
});

test("min_duration > max_duration falha", () => {
  const r = validarProduto({ kind: "program", name: "X", campus_id: "c", min_duration: 10, max_duration: 4 });
  assert.ok(!r.ok && camposFalha(r).includes("max_duration"));
});

test("duração negativa falha", () => {
  const r = validarProduto({ kind: "program", name: "X", campus_id: "c", min_duration: -1 });
  assert.ok(!r.ok && camposFalha(r).includes("min_duration"));
});

test("available_from > available_until falha; datas inválidas falham", () => {
  const r1 = validarProduto({
    kind: "program", name: "X", campus_id: "c",
    available_from: "2026-06-01", available_until: "2026-01-01",
  });
  assert.ok(!r1.ok && camposFalha(r1).includes("available_until"));
  const r2 = validarProduto({ kind: "program", name: "X", campus_id: "c", available_from: "2026-13-40" });
  assert.ok(!r2.ok && camposFalha(r2).includes("available_from"));
  const r3 = validarProduto({ kind: "program", name: "X", campus_id: "c", available_from: "01/06/2026" });
  assert.ok(!r3.ok && camposFalha(r3).includes("available_from"));
});

test("acomodação: enums válidos passam; inválidos falham", () => {
  const ok = validarProduto({
    kind: "accommodation", name: "Homestay A", campus_id: "c",
    detail: { accommodation_type: "homestay", room_type: "private", bathroom_type: "shared", meal_plan: "half_board", check_in_weekday: 6 },
  });
  assert.ok(ok.ok);
  if (ok.ok && ok.valor.detalhe.kind === "accommodation") {
    assert.equal(ok.valor.detalhe.accommodation.meal_plan, "half_board");
  }
  const bad = validarProduto({
    kind: "accommodation", name: "X", campus_id: "c",
    detail: { accommodation_type: "castelo", meal_plan: "brunch", check_in_weekday: 9 },
  });
  assert.ok(!bad.ok);
  const c = camposFalha(bad);
  assert.ok(c.includes("accommodation_type"));
  assert.ok(c.includes("meal_plan"));
  assert.ok(c.includes("check_in_weekday"));
});

test("seguro: policy_unit valida; max_duration_days inteiro", () => {
  const ok = validarProduto({
    kind: "insurance", name: "Seguro Saúde", campus_id: "c",
    detail: { provider_name: "ACME", policy_unit: "week", max_duration_days: 90 },
  });
  assert.ok(ok.ok);
  const bad = validarProduto({
    kind: "insurance", name: "X", campus_id: "c",
    detail: { policy_unit: "ano", max_duration_days: 1.5 },
  });
  assert.ok(!bad.ok);
  const c = camposFalha(bad);
  assert.ok(c.includes("policy_unit"));
  assert.ok(c.includes("max_duration_days"));
});

test("outro (transfer etc): charge_unit é obrigatório", () => {
  const semUnit = validarProduto({ kind: "other", name: "Transfer Aeroporto", campus_id: "c", detail: {} });
  assert.ok(!semUnit.ok && camposFalha(semUnit).includes("charge_unit"));
  const ok = validarProduto({
    kind: "other", name: "Transfer Aeroporto", campus_id: "c",
    detail: { charge_unit: "once", category: "transfer" },
  });
  assert.ok(ok.ok);
  if (ok.ok && ok.valor.detalhe.kind === "other") {
    assert.equal(ok.valor.detalhe.other.charge_unit, "once");
    assert.equal(ok.valor.detalhe.other.category, "transfer");
  }
});

test("pacote: pricing_mode obrigatório; sum_of_items exige itens", () => {
  const semModo = validarProduto({ kind: "package", name: "Pacote", campus_id: "c", detail: {} });
  assert.ok(!semModo.ok && camposFalha(semModo).includes("pricing_mode"));

  const somaVazio = validarProduto({
    kind: "package", name: "Pacote", campus_id: "c",
    detail: { pricing_mode: "sum_of_items", itens: [] },
  });
  assert.ok(!somaVazio.ok && camposFalha(somaVazio).includes("itens"));

  const ok = validarProduto({
    kind: "package", name: "Pacote Verão", campus_id: "c",
    detail: {
      pricing_mode: "sum_of_items",
      itens: [{ item_product_id: "p1", quantity: 4, unit: "week" }, { item_product_id: "p2", is_optional: true }],
    },
  });
  assert.ok(ok.ok);
  if (ok.ok && ok.valor.detalhe.kind === "package") {
    assert.equal(ok.valor.detalhe.package.itens.length, 2);
    assert.equal(ok.valor.detalhe.package.itens[0].sort, 0);
    assert.equal(ok.valor.detalhe.package.itens[1].is_optional, true);
    assert.equal(ok.valor.detalhe.package.itens[1].sort, 1); // sort default = índice
  }
});

test("pacote: item sem item_product_id falha", () => {
  const r = validarProduto({
    kind: "package", name: "P", campus_id: "c",
    detail: { pricing_mode: "fixed_price", itens: [{ quantity: 1 }] },
  });
  assert.ok(!r.ok && camposFalha(r).some((c) => c.startsWith("itens[0]")));
});

test("pacote fixed_price sem itens é válido (preço fixo, sem composição)", () => {
  const r = validarProduto({
    kind: "package", name: "Combo Fixo", campus_id: "c",
    detail: { pricing_mode: "fixed_price" },
  });
  assert.ok(r.ok);
});

test("detalhe do vertical errado é ignorado (não vaza)", () => {
  // manda campos de acomodação num programa: devem ser descartados, não gravados.
  const r = validarProduto({
    kind: "program", name: "X", campus_id: "c",
    detail: { language: "en", accommodation_type: "homestay", meal_plan: "full_board" },
  });
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.valor.detalhe.kind, "program");
    assert.ok(!("accommodation_type" in (r.valor.detalhe as any).program));
  }
});

test("corpo não-objeto falha limpo", () => {
  assert.ok(!validarProduto(null).ok);
  assert.ok(!validarProduto("x").ok);
  assert.ok(!validarProduto([]).ok);
});
