import { test } from "node:test";
import assert from "node:assert/strict";
import { tenantPertenceAoDeploy } from "./login-tenant.ts";

const DEPLOY = "11111111-1111-1111-1111-111111111111";
const OUTRO = "22222222-2222-2222-2222-222222222222";

test("tenant igual ao do deploy pertence", () => {
  assert.equal(tenantPertenceAoDeploy(DEPLOY, DEPLOY, false), true);
  assert.equal(tenantPertenceAoDeploy(DEPLOY, DEPLOY, true), true);
});

test("tenant de outro deploy NÃO pertence", () => {
  assert.equal(tenantPertenceAoDeploy(OUTRO, DEPLOY, false), false);
  // Ser dono do legado não abre acesso a outro tenant explícito.
  assert.equal(tenantPertenceAoDeploy(OUTRO, DEPLOY, true), false);
});

test("tenant NULL (legado) só pertence ao deploy dono do legado", () => {
  assert.equal(tenantPertenceAoDeploy(null, DEPLOY, true), true);
  assert.equal(tenantPertenceAoDeploy(null, DEPLOY, false), false);
  // undefined é tratado como legado também (coluna ausente no select == nulo).
  assert.equal(tenantPertenceAoDeploy(undefined, DEPLOY, true), true);
  assert.equal(tenantPertenceAoDeploy(undefined, DEPLOY, false), false);
});
