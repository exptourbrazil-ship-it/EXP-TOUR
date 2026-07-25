// Testes dos helpers puros do NPS. Roda com `npm test` (node --test).
import { test } from "node:test";
import assert from "node:assert/strict";
import { validarNotaNps, classificarNps, montarLinkIndicacaoWhatsApp, aberturaIndicacao, SITE_PUBLICO_EXP_TOUR, WHATSAPP_EXP_TOUR } from "./nps.ts";

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

test("aberturaIndicacao escolhe o artigo pelo sexo", () => {
  assert.equal(aberturaIndicacao("Giovanna", "F"), "Oi! Aqui e a Giovanna.");
  assert.equal(aberturaIndicacao("Joao", "M"), "Oi! Aqui e o Joao.");
  // sem sexo definido -> forma neutra, sem artigo
  assert.equal(aberturaIndicacao("Alex", null), "Oi! Meu nome e Alex.");
  assert.equal(aberturaIndicacao("Alex", undefined), "Oi! Meu nome e Alex.");
  // sem nome -> so a saudacao
  assert.equal(aberturaIndicacao("", "F"), "Oi!");
});

test("montarLinkIndicacaoWhatsApp usa primeiro nome, site publico e WhatsApp", () => {
  const link = montarLinkIndicacaoWhatsApp("Giovanna Rizzotto", "F");
  assert.ok(link.startsWith("https://wa.me/?text="));
  const texto = decodeURIComponent(link.slice("https://wa.me/?text=".length));
  assert.ok(texto.includes("Aqui e a Giovanna")); // feminino, so o primeiro nome
  assert.ok(!texto.includes("Rizzotto"));
  assert.ok(texto.includes(SITE_PUBLICO_EXP_TOUR));
  assert.ok(texto.includes(WHATSAPP_EXP_TOUR));
  assert.ok(!texto.toLowerCase().includes("vercel")); // nunca aponta para o portal
});

test("montarLinkIndicacaoWhatsApp funciona sem nome e sem sexo", () => {
  const link = montarLinkIndicacaoWhatsApp(null);
  const texto = decodeURIComponent(link.slice("https://wa.me/?text=".length));
  assert.ok(texto.startsWith("Oi!"));
  assert.ok(texto.includes(SITE_PUBLICO_EXP_TOUR));
});
