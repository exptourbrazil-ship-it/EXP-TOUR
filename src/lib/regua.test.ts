// Testes do helper puro da regua de cobranca.
// Roda com o runner nativo do Node: `npm test` (node --test), sem dependencias.
import { test } from "node:test";
import assert from "node:assert/strict";
import { diasAteVencimento, janelaLembrete, janelaEhAtraso } from "./regua.ts";

test("diasAteVencimento conta dias corridos (vencimento - hoje)", () => {
  assert.equal(diasAteVencimento("2026-08-01", "2026-08-08"), 7);
  assert.equal(diasAteVencimento("2026-08-08", "2026-08-01"), -7);
  assert.equal(diasAteVencimento("2026-08-01", "2026-08-01"), 0);
});

test("diasAteVencimento ignora hora/fuso na string ISO", () => {
  assert.equal(diasAteVencimento("2026-08-01T23:59:59Z", "2026-08-03T00:00:00Z"), 2);
});

test("diasAteVencimento retorna null para data invalida", () => {
  assert.equal(diasAteVencimento("2026-08-01", "data-ruim"), null);
  assert.equal(diasAteVencimento("", "2026-08-01"), null);
});

test("janelaLembrete dispara D-7 sete dias antes do vencimento", () => {
  assert.equal(janelaLembrete("2026-08-01", "2026-08-08"), "D-7");
});

test("janelaLembrete dispara D-2 dois dias antes", () => {
  assert.equal(janelaLembrete("2026-08-06", "2026-08-08"), "D-2");
});

test("janelaLembrete dispara D+1 um dia depois do vencimento", () => {
  assert.equal(janelaLembrete("2026-08-09", "2026-08-08"), "D+1");
});

test("janelaLembrete dispara D+5 cinco dias depois", () => {
  assert.equal(janelaLembrete("2026-08-13", "2026-08-08"), "D+5");
});

test("janelaLembrete retorna null fora das janelas (ex.: no vencimento, D-3, D+2)", () => {
  assert.equal(janelaLembrete("2026-08-08", "2026-08-08"), null); // no dia
  assert.equal(janelaLembrete("2026-08-05", "2026-08-08"), null); // D-3
  assert.equal(janelaLembrete("2026-08-10", "2026-08-08"), null); // D+2
});

test("janelaEhAtraso distingue lembrete preventivo de atraso", () => {
  assert.equal(janelaEhAtraso("D-7"), false);
  assert.equal(janelaEhAtraso("D-2"), false);
  assert.equal(janelaEhAtraso("D+1"), true);
  assert.equal(janelaEhAtraso("D+5"), true);
});
