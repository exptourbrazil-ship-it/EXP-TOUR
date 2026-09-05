// Testes do motor puro de validacao de regras de elegibilidade.
// Roda com o runner nativo do Node: `npm test` (node --test), sem dependencias.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validarElegibilidade,
  bloqueantesRemovidas,
  justificativaValida,
  type Falha,
  type RegraNorm,
} from "./elegibilidade.ts";

function campos(r: ReturnType<typeof validarElegibilidade>): string[] {
  return r.ok ? [] : r.falhas.map((f: Falha) => f.campo);
}

test("conjunto válido normaliza as regras", () => {
  const r = validarElegibilidade({
    product_id: "prod-1",
    regras: [
      { group_index: 0, attribute: "age_at_start", operator: "between", value: [16, 99] },
      { group_index: 0, attribute: "nationality", operator: "in", value: ["BR", "AR"], is_blocking: true },
    ],
  });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.valor.product_id, "prod-1");
  assert.equal(r.valor.regras.length, 2);
  assert.deepEqual(r.valor.regras[0].value, [16, 99]);
  assert.equal(r.valor.regras[1].is_blocking, true);
});

test("conjunto vazio é válido (produto sem restrição)", () => {
  const r = validarElegibilidade({ product_id: "prod-1", regras: [] });
  assert.ok(r.ok && r.valor.regras.length === 0);
});

test("product_id obrigatório", () => {
  assert.ok(campos(validarElegibilidade({ regras: [] })).includes("product_id"));
});

test("attribute / operator inválidos falham", () => {
  const r = validarElegibilidade({ product_id: "p", regras: [{ attribute: "signo", operator: "regex", value: "x" }] });
  const c = campos(r);
  assert.ok(c.some((x) => x.includes("attribute")));
  assert.ok(c.some((x) => x.includes("operator")));
});

test("between exige [min,max] numéricos com min<=max e só age_at_start", () => {
  assert.ok(campos(validarElegibilidade({ product_id: "p", regras: [{ attribute: "age_at_start", operator: "between", value: [30, 10] }] })).some((c) => c.includes("value")));
  assert.ok(campos(validarElegibilidade({ product_id: "p", regras: [{ attribute: "age_at_start", operator: "between", value: [18] }] })).some((c) => c.includes("value")));
  assert.ok(campos(validarElegibilidade({ product_id: "p", regras: [{ attribute: "nationality", operator: "between", value: [1, 2] }] })).some((c) => c.includes("value")));
});

test("gte/lte só age_at_start e numéricos; aceita coerção de string", () => {
  const ok = validarElegibilidade({ product_id: "p", regras: [{ attribute: "age_at_start", operator: "gte", value: "18" }] });
  assert.ok(ok.ok && ok.valor.regras[0].value === 18);
  assert.ok(campos(validarElegibilidade({ product_id: "p", regras: [{ attribute: "language_level", operator: "gte", value: "B2" }] })).some((c) => c.includes("value")));
});

test("in/not_in exigem lista não-vazia; strings deduplicadas; numéricos p/ idade", () => {
  assert.ok(campos(validarElegibilidade({ product_id: "p", regras: [{ attribute: "nationality", operator: "in", value: [] }] })).some((c) => c.includes("value")));
  const r = validarElegibilidade({ product_id: "p", regras: [{ attribute: "nationality", operator: "not_in", value: ["BR", "BR", " AR "] }] });
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual(r.valor.regras[0].value, ["BR", "AR"]);
  const idade = validarElegibilidade({ product_id: "p", regras: [{ attribute: "age_at_start", operator: "in", value: ["16", 18] }] });
  assert.ok(idade.ok && Array.isArray(idade.valor.regras[0].value));
});

test("has_visa: só eq booleano", () => {
  assert.ok(campos(validarElegibilidade({ product_id: "p", regras: [{ attribute: "has_visa", operator: "in", value: [true] }] })).some((c) => c.includes("value")));
  const r = validarElegibilidade({ product_id: "p", regras: [{ attribute: "has_visa", operator: "eq", value: "true" }] });
  assert.ok(r.ok && r.valor.regras[0].value === true);
});

test("onshore_status: valores restritos a onshore/offshore", () => {
  assert.ok(campos(validarElegibilidade({ product_id: "p", regras: [{ attribute: "onshore_status", operator: "eq", value: "meio" }] })).some((c) => c.includes("value")));
  const r = validarElegibilidade({ product_id: "p", regras: [{ attribute: "onshore_status", operator: "in", value: ["onshore", "offshore"] }] });
  assert.ok(r.ok);
});

test("eq de atributo string exige valor não-vazio", () => {
  assert.ok(campos(validarElegibilidade({ product_id: "p", regras: [{ attribute: "education_level", operator: "eq", value: "  " }] })).some((c) => c.includes("value")));
  const r = validarElegibilidade({ product_id: "p", regras: [{ attribute: "education_level", operator: "eq", value: "highschool" }] });
  assert.ok(r.ok && r.valor.regras[0].value === "highschool");
});

test("group_index default 0; is_blocking default false", () => {
  const r = validarElegibilidade({ product_id: "p", regras: [{ attribute: "nationality", operator: "eq", value: "BR" }] });
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.valor.regras[0].group_index, 0);
    assert.equal(r.valor.regras[0].is_blocking, false);
  }
});

test("corpo não-objeto falha limpo", () => {
  assert.ok(!validarElegibilidade(null).ok);
  assert.ok(!validarElegibilidade([]).ok);
});

// ── bloqueantesRemovidas + justificativaValida ───────────────────────────────
const rBloq = (attr: string, value: unknown, g = 0): RegraNorm => ({
  group_index: g, attribute: attr as any, operator: "eq" as any, value, is_blocking: true,
});
const rAviso = (attr: string, value: unknown): RegraNorm => ({
  group_index: 0, attribute: attr as any, operator: "eq" as any, value, is_blocking: false,
});

test("bloqueantesRemovidas: nada removido quando o conjunto se mantém", () => {
  const antes = [rBloq("nationality", "BR"), rAviso("has_visa", true)];
  const depois = [rBloq("nationality", "BR")]; // removeu só um AVISO, não bloqueante
  assert.equal(bloqueantesRemovidas(antes, depois).length, 0);
});

test("bloqueantesRemovidas: detecta remoção direta de bloqueante", () => {
  const antes = [rBloq("nationality", "BR"), rBloq("residence_country", "PT")];
  const depois = [rBloq("nationality", "BR")];
  const rem = bloqueantesRemovidas(antes, depois);
  assert.equal(rem.length, 1);
  assert.equal(rem[0].attribute, "residence_country");
});

test("bloqueantesRemovidas: swap (remove uma, adiciona outra) ainda conta", () => {
  const antes = [rBloq("nationality", "BR")];
  const depois = [rBloq("residence_country", "PT")]; // mesma contagem, conteúdo diferente
  assert.equal(bloqueantesRemovidas(antes, depois).length, 1);
});

test("bloqueantesRemovidas: desligar o bloqueio conta como remoção", () => {
  const antes = [rBloq("nationality", "BR")];
  const depois = [rAviso("nationality", "BR")]; // mesma regra, mas virou aviso
  assert.equal(bloqueantesRemovidas(antes, depois).length, 1);
});

test("justificativaValida exige ≥10 caracteres após trim", () => {
  assert.equal(justificativaValida("curto"), false);
  assert.equal(justificativaValida("         "), false);
  assert.equal(justificativaValida(null), false);
  assert.equal(justificativaValida("escola confirmou a mudança"), true);
});
