// Suite dos helpers puros do Catalogo (spec secoes 3.3 e 3.5).
// Roda com o runner nativo do Node: `npm test` (node --test), sem dependencias.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveMarket,
  evaluateEligibility,
  type Market,
  type EligibilityRule,
  type StudentContext,
} from "./catalog.ts";

// ---------------------------------------------------------------------------
// Mercados (spec 3.3)
// ---------------------------------------------------------------------------

const MARKETS: Market[] = [
  { id: "br", name: "Brasil", countryCodes: ["BR"] },
  { id: "latam", name: "America Latina", countryCodes: ["AR", "CL", "CO"] },
  { id: "row", name: "Rest of World", countryCodes: [], isDefault: true },
];

test("resolveMarket bate pelo codigo de nacionalidade", () => {
  assert.equal(resolveMarket("BR", MARKETS)?.id, "br");
  assert.equal(resolveMarket("CL", MARKETS)?.id, "latam");
});

test("resolveMarket e case-insensitive no codigo", () => {
  assert.equal(resolveMarket("br", MARKETS)?.id, "br");
  assert.equal(resolveMarket("Co", MARKETS)?.id, "latam");
});

test("resolveMarket cai no default quando nao ha match", () => {
  assert.equal(resolveMarket("PT", MARKETS)?.id, "row");
});

test("resolveMarket com nacionalidade ausente usa o default", () => {
  assert.equal(resolveMarket(undefined, MARKETS)?.id, "row");
  assert.equal(resolveMarket("", MARKETS)?.id, "row");
});

test("resolveMarket retorna null quando nao ha match nem default", () => {
  const semDefault: Market[] = [
    { id: "br", name: "Brasil", countryCodes: ["BR"] },
  ];
  assert.equal(resolveMarket("PT", semDefault), null);
  assert.equal(resolveMarket(undefined, semDefault), null);
});

// ---------------------------------------------------------------------------
// Elegibilidade (spec 3.5)
// ---------------------------------------------------------------------------

const START = "2026-09-01";

test("produto sem regras e elegivel para todos", () => {
  const r = evaluateEligibility([], {}, START);
  assert.deepEqual(r, { eligible: true, blocking: false, failedGroups: [] });
});

test("grupo unico com E: todas as regras precisam passar", () => {
  const rules: EligibilityRule[] = [
    { groupIndex: 0, attribute: "nationality", operator: "eq", value: "BR" },
    {
      groupIndex: 0,
      attribute: "age_at_start",
      operator: "gte",
      value: 18,
    },
  ];
  const ctx: StudentContext = { nationalityCode: "BR", birthDate: "2000-01-01" };
  assert.equal(evaluateEligibility(rules, ctx, START).eligible, true);

  // Falha uma regra do E -> grupo falha -> nao elegivel.
  const menor: StudentContext = {
    nationalityCode: "BR",
    birthDate: "2015-01-01",
  };
  const res = evaluateEligibility(rules, menor, START);
  assert.equal(res.eligible, false);
  assert.deepEqual(res.failedGroups, [0]);
});

test("grupos diferentes combinam com OU (passa por um grupo mesmo falhando o outro)", () => {
  const rules: EligibilityRule[] = [
    // Grupo 0: brasileiro adulto.
    { groupIndex: 0, attribute: "nationality", operator: "eq", value: "BR" },
    { groupIndex: 0, attribute: "age_at_start", operator: "gte", value: 18 },
    // Grupo 1: residente onshore com visto.
    { groupIndex: 1, attribute: "onshore_status", operator: "eq", value: "onshore" },
    { groupIndex: 1, attribute: "has_visa", operator: "eq", value: true },
  ];
  // Nao e brasileiro (grupo 0 falha), mas e onshore com visto (grupo 1 passa).
  const ctx: StudentContext = {
    nationalityCode: "AR",
    birthDate: "2010-01-01",
    onshoreStatus: "onshore",
    hasVisa: true,
  };
  const res = evaluateEligibility(rules, ctx, START);
  assert.equal(res.eligible, true);
  assert.deepEqual(res.failedGroups, [0]);
});

test("nao elegivel quando todos os grupos falham", () => {
  const rules: EligibilityRule[] = [
    { groupIndex: 0, attribute: "nationality", operator: "eq", value: "BR" },
    { groupIndex: 1, attribute: "has_visa", operator: "eq", value: true },
  ];
  const ctx: StudentContext = { nationalityCode: "AR", hasVisa: false };
  const res = evaluateEligibility(rules, ctx, START);
  assert.equal(res.eligible, false);
  assert.deepEqual(res.failedGroups.sort(), [0, 1]);
});

test("age_at_start between: menor, dentro e maior", () => {
  const rules: EligibilityRule[] = [
    {
      groupIndex: 0,
      attribute: "age_at_start",
      operator: "between",
      value: [16, 18],
    },
  ];
  // Faz 15 em START (nasceu 2011-06-01) -> menor -> falha.
  const menor: StudentContext = { birthDate: "2011-06-01" };
  assert.equal(evaluateEligibility(rules, menor, START).eligible, false);

  // Faz 17 em START (nasceu 2009-06-01) -> dentro -> passa.
  const dentro: StudentContext = { birthDate: "2009-06-01" };
  assert.equal(evaluateEligibility(rules, dentro, START).eligible, true);

  // Faz 26 em START (nasceu 2000-06-01) -> maior -> falha.
  const maior: StudentContext = { birthDate: "2000-06-01" };
  assert.equal(evaluateEligibility(rules, maior, START).eligible, false);
});

test("age_at_start considera aniversario ainda nao ocorrido", () => {
  const rules: EligibilityRule[] = [
    { groupIndex: 0, attribute: "age_at_start", operator: "gte", value: 18 },
  ];
  // Nasceu 2008-12-01; em 2026-09-01 ainda tem 17 (aniversario em dezembro).
  const ctx: StudentContext = { birthDate: "2008-12-01" };
  assert.equal(evaluateEligibility(rules, ctx, START).eligible, false);
});

test("age_at_start falha sem birthDate ou sem startDate (nao comprovavel)", () => {
  const rules: EligibilityRule[] = [
    { groupIndex: 0, attribute: "age_at_start", operator: "gte", value: 18 },
  ];
  assert.equal(evaluateEligibility(rules, {}, START).eligible, false);
  assert.equal(
    evaluateEligibility(rules, { birthDate: "2000-01-01" }, undefined).eligible,
    false,
  );
});

test("nationality in e not_in", () => {
  const inRule: EligibilityRule[] = [
    {
      groupIndex: 0,
      attribute: "nationality",
      operator: "in",
      value: ["BR", "PT", "AO"],
    },
  ];
  assert.equal(
    evaluateEligibility(inRule, { nationalityCode: "PT" }, START).eligible,
    true,
  );
  assert.equal(
    evaluateEligibility(inRule, { nationalityCode: "US" }, START).eligible,
    false,
  );

  const notInRule: EligibilityRule[] = [
    {
      groupIndex: 0,
      attribute: "nationality",
      operator: "not_in",
      value: ["RU", "IR"],
    },
  ];
  assert.equal(
    evaluateEligibility(notInRule, { nationalityCode: "BR" }, START).eligible,
    true,
  );
  assert.equal(
    evaluateEligibility(notInRule, { nationalityCode: "RU" }, START).eligible,
    false,
  );
});

test("regra bloqueante marca blocking=true quando nao-elegivel", () => {
  const rules: EligibilityRule[] = [
    {
      groupIndex: 0,
      attribute: "age_at_start",
      operator: "gte",
      value: 18,
      isBlocking: true,
    },
  ];
  const menor: StudentContext = { birthDate: "2015-01-01" };
  const res = evaluateEligibility(rules, menor, START);
  assert.equal(res.eligible, false);
  assert.equal(res.blocking, true);
});

test("regra nao-bloqueante que falha vira aviso (blocking=false)", () => {
  const rules: EligibilityRule[] = [
    {
      groupIndex: 0,
      attribute: "language_level",
      operator: "in",
      value: ["B2", "C1"],
    },
  ];
  const ctx: StudentContext = { languageLevel: "A2" };
  const res = evaluateEligibility(rules, ctx, START);
  assert.equal(res.eligible, false);
  assert.equal(res.blocking, false);
});

test("regra elegivel nunca bloqueia mesmo com isBlocking", () => {
  const rules: EligibilityRule[] = [
    {
      groupIndex: 0,
      attribute: "has_visa",
      operator: "eq",
      value: true,
      isBlocking: true,
    },
  ];
  const res = evaluateEligibility(rules, { hasVisa: true }, START);
  assert.equal(res.eligible, true);
  assert.equal(res.blocking, false);
});
