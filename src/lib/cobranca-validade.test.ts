import { test } from "node:test";
import assert from "node:assert/strict";
import { fimDoDiaSaoPauloISO } from "./cobranca-validade.ts";

test("fim do dia em SP para um instante da manhã", () => {
  // 10:00 UTC = 07:00 em SP, mesmo dia
  assert.equal(fimDoDiaSaoPauloISO("2026-09-12T10:00:00Z"), "2026-09-12T23:59:59.000-03:00");
});

test("instante após a meia-noite UTC ainda é o dia anterior em SP", () => {
  // 02:00 UTC de 12/09 = 23:00 de 11/09 em SP
  assert.equal(fimDoDiaSaoPauloISO("2026-09-12T02:00:00Z"), "2026-09-11T23:59:59.000-03:00");
});

test("vira o dia em SP às 03:00 UTC", () => {
  // 03:00 UTC = 00:00 em SP -> já é o novo dia
  assert.equal(fimDoDiaSaoPauloISO("2026-09-12T03:00:00Z"), "2026-09-12T23:59:59.000-03:00");
});

test("data inválida lança", () => {
  assert.throws(() => fimDoDiaSaoPauloISO("nao-e-data"));
});
