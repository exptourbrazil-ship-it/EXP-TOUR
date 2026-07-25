// Testes dos helpers puros do NPS. Roda com `npm test` (node --test).
import { test } from "node:test";
import assert from "node:assert/strict";
import { validarNotaNps, classificarNps, montarLinkIndicacaoWhatsApp } from "./nps.ts";

test("validarNotaNps aceita inteiros de 0 a 10", () => {
  assert.equal(validarNotaNps(0), true);
  assert.equal(validarNotaNps(7), true);
  assert.equal(validarNotaNps(10), true);
});

test("validarNotaNps rejeita fora do intervalo, nao-inteiros e nao-numeros", () => {
  assert.equal(validarNotaNps(-1), false);
  assert.equal(validarNotaNps(11), false);
  assert.equal(validarNotaNps(7.5), false);
  assert.equal(validarNotaNps("8"), false);
  assert.equal(validarNotaNps(null), false);
  assert.equal(validarNotaNps(undefined), false);
});

test("classificarNps segue a regra 0-6/7-8/9-10", () => {
  assert.equal(classificarNps(0), "detrator");
  assert.equal(classificarNps(6), "detrator");
  assert.equal(classificarNps(7), "neutro");
  assert.equal(classificarNps(8), "neutro");
  assert.equal(classificarNps(9), "promotor");
  assert.equal(classificarNps(10), "promotor");
});

test("montarLinkIndicacaoWhatsApp usa o primeiro nome e codifica o texto", () => {
  const link = montarLinkIndicacaoWhatsApp("Antonio Schultz", "https://portal.exp-tour.com");
  assert.ok(link.startsWith("https://wa.me/?text="));
  assert.ok(link.includes("Antonio"));
  assert.ok(!link.includes("Schultz")); // so o primeiro nome
  assert.ok(link.includes(encodeURIComponent("https://portal.exp-tour.com")));
});

test("montarLinkIndicacaoWhatsApp funciona sem nome e sem url", () => {
  const link = montarLinkIndicacaoWhatsApp(null);
  assert.ok(link.startsWith("https://wa.me/?text="));
  assert.ok(link.length > "https://wa.me/?text=".length);
});
