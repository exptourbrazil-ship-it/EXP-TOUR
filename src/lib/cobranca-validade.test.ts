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

test("perto da meia-noite rola para o fim do dia seguinte (janela mínima)", () => {
  // 02:50 UTC de 13/09 = 23:50 de 12/09 em SP -> faltam ~10min para as 23h59:
  // rola para 13/09.
  assert.equal(fimDoDiaSaoPauloISO("2026-09-13T02:50:00Z"), "2026-09-13T23:59:59.000-03:00");
  // 23:00 em SP (>30min de folga) permanece no mesmo dia.
  assert.equal(fimDoDiaSaoPauloISO("2026-09-12T02:00:00Z"), "2026-09-11T23:59:59.000-03:00");
});

test("data inválida lança", () => {
  assert.throws(() => fimDoDiaSaoPauloISO("nao-e-data"));
});
