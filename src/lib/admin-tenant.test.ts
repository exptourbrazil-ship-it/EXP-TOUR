import { test } from "node:test";
import assert from "node:assert/strict";
import { escopoPermiteContrato, type EscopoAdmin } from "./admin-tenant.ts";

// Regra de autorizacao entre tenants (helper puro). O restante do modulo
// (escopoTenantAdmin/tenantDoContrato/contratoIdsDoEscopo) toca sessao/DB e e
// coberto pela revisao de seguranca + integracao; aqui travamos a DECISAO.

const GLOBAL: EscopoAdmin = { global: true };
const FORIO: EscopoAdmin = { global: false, tenantId: "forio-uuid" };

test("admin global ve qualquer contrato, inclusive sem tenant (NULL)", () => {
  assert.equal(escopoPermiteContrato(GLOBAL, "forio-uuid"), true);
  assert.equal(escopoPermiteContrato(GLOBAL, "exp-tour-uuid"), true);
  assert.equal(escopoPermiteContrato(GLOBAL, null), true);
});

test("admin escopado ve o contrato do PROPRIO tenant", () => {
  assert.equal(escopoPermiteContrato(FORIO, "forio-uuid"), true);
});

test("admin escopado NAO ve contrato de OUTRO tenant (falha fechada -> 404)", () => {
  assert.equal(escopoPermiteContrato(FORIO, "exp-tour-uuid"), false);
});

test("admin escopado NAO ve contrato sem tenant (NULL = legado EXP Tour)", () => {
  assert.equal(escopoPermiteContrato(FORIO, null), false);
});
