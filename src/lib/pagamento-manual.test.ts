// Testes dos helpers puros da baixa manual de parcela.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cotacaoImplicita, validarValoresPagamentoManual } from "./pagamento-manual.ts";

test("cotacaoImplicita: BRL / moeda do programa, 6 casas", () => {
  // R$ 4.019,71 por CA$ 1.000,00 => 4.01971
  assert.equal(cotacaoImplicita(4019.71, 1000), 4.01971);
  // arredonda para 6 casas
  assert.equal(cotacaoImplicita(10, 3), 3.333333);
});

test("cotacaoImplicita: insumos invalidos -> null (sem divisao por zero)", () => {
  assert.equal(cotacaoImplicita(100, 0), null);
  assert.equal(cotacaoImplicita(0, 100), null);
  assert.equal(cotacaoImplicita(-5, 100), null);
  assert.equal(cotacaoImplicita(Number.NaN, 100), null);
});

test("validarValoresPagamentoManual: caso valido", () => {
  const r = validarValoresPagamentoManual({ valorBRL: 4019.71, valorPrograma: 1000, pagoEm: "2026-08-21", hojeISO: "2026-09-10" });
  assert.deepEqual(r, { ok: true });
});

test("validarValoresPagamentoManual: recusa valores <= 0", () => {
  assert.equal(validarValoresPagamentoManual({ valorBRL: 0, valorPrograma: 1000, pagoEm: "2026-08-21", hojeISO: "2026-09-10" }).ok, false);
  assert.equal(validarValoresPagamentoManual({ valorBRL: 100, valorPrograma: 0, pagoEm: "2026-08-21", hojeISO: "2026-09-10" }).ok, false);
});

test("validarValoresPagamentoManual: recusa data no futuro", () => {
  const r = validarValoresPagamentoManual({ valorBRL: 100, valorPrograma: 100, pagoEm: "2026-12-25", hojeISO: "2026-09-10" });
  assert.deepEqual(r, { ok: false, motivo: "data_no_futuro" });
});

test("validarValoresPagamentoManual: data de hoje e aceita", () => {
  const r = validarValoresPagamentoManual({ valorBRL: 100, valorPrograma: 100, pagoEm: "2026-09-10", hojeISO: "2026-09-10" });
  assert.deepEqual(r, { ok: true });
});
