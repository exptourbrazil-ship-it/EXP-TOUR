// Testes do motor puro de validacao de campus.
// Roda com o runner nativo do Node: `npm test` (node --test), sem dependencias.
import { test } from "node:test";
import assert from "node:assert/strict";
import { validarCampus, CAMPUS_STATUSES, type Falha } from "./campus.ts";

function campos(r: ReturnType<typeof validarCampus>): string[] {
  return r.ok ? [] : r.falhas.map((f: Falha) => f.campo);
}

function base(over: Record<string, unknown> = {}) {
  return {
    name: "Connect International School — Toronto",
    country_code: "ca",
    city: "Toronto",
    timezone: "America/Toronto",
    base_currency: "cad",
    ...over,
  };
}

test("campus válido normaliza país/moeda para maiúsculo e status default 'active'", () => {
  const r = validarCampus(base());
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.valor.country_code, "CA");
  assert.equal(r.valor.base_currency, "CAD");
  assert.equal(r.valor.status, "active"); // default: evita colidir com o único rascunho por fornecedor
  assert.equal(r.valor.region, null);
  assert.equal(r.valor.email, null);
});

test("campos obrigatórios ausentes são apontados por campo", () => {
  const r = validarCampus({});
  assert.ok(!r.ok);
  const c = campos(r);
  for (const esperado of ["name", "city", "country_code", "base_currency", "timezone"]) {
    assert.ok(c.includes(esperado), `faltou apontar ${esperado}`);
  }
});

test("país precisa ter 2 letras e moeda 3 letras", () => {
  assert.ok(campos(validarCampus(base({ country_code: "CAN" }))).includes("country_code"));
  assert.ok(campos(validarCampus(base({ base_currency: "CA" }))).includes("base_currency"));
  assert.ok(campos(validarCampus(base({ base_currency: "C4D" }))).includes("base_currency"));
});

test("fuso aceita UTC e formato Area/Cidade; rejeita lixo", () => {
  assert.ok(validarCampus(base({ timezone: "UTC" })).ok);
  assert.ok(validarCampus(base({ timezone: "Europe/Dublin" })).ok);
  assert.ok(campos(validarCampus(base({ timezone: "Toronto" }))).includes("timezone"));
});

test("status respeita o enum do schema", () => {
  for (const s of CAMPUS_STATUSES) {
    const r = validarCampus(base({ status: s }));
    assert.ok(r.ok);
    if (r.ok) assert.equal(r.valor.status, s);
  }
  assert.ok(campos(validarCampus(base({ status: "archived" }))).includes("status"));
});

test("e-mail inválido é apontado; website ganha https:// quando falta", () => {
  assert.ok(campos(validarCampus(base({ email: "sem-arroba" }))).includes("email"));
  const r = validarCampus(base({ email: "Info@School.CA", website: "school.ca" }));
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.valor.email, "info@school.ca");
  assert.equal(r.valor.website, "https://school.ca");
});

test("corpo não-objeto é rejeitado", () => {
  const r = validarCampus("x");
  assert.ok(!r.ok);
  if (!r.ok) assert.equal(r.falhas[0].campo, "_");
});

test("fuso com formato certo mas inexistente (Foo/Bar) é rejeitado", () => {
  assert.ok(campos(validarCampus(base({ timezone: "Foo/Bar" }))).includes("timezone"));
  assert.ok(validarCampus(base({ timezone: "America/Vancouver" })).ok);
});

test("placeholders do auto-provisionamento (ZZ / '(a definir)') só valem em rascunho", () => {
  // Em rascunho: aceito (é como o campus nasce no auto-provisionamento).
  assert.ok(validarCampus(base({ country_code: "ZZ", city: "(a definir)", status: "draft" })).ok);
  // Ativo (default) ou inativo: exige país/cidade reais.
  const ativo = campos(validarCampus(base({ country_code: "ZZ", city: "(a definir)" })));
  assert.ok(ativo.includes("country_code"));
  assert.ok(ativo.includes("city"));
  assert.ok(campos(validarCampus(base({ country_code: "ZZ", status: "inactive" }))).includes("country_code"));
});
