// Testes dos helpers puros do NPS. Roda com `npm test` (node --test).
import { test } from "node:test";
import assert from "node:assert/strict";
import { validarNotaNps, classificarNps, calcularNps, montarLinkIndicacaoWhatsApp, aberturaIndicacao, SITE_PUBLICO_EXP_TOUR, WHATSAPP_EXP_TOUR } from "./nps.ts";

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

test("calcularNps com zero respostas retorna score 0", () => {
  const r = calcularNps([]);
  assert.deepEqual(r, { total: 0, promotores: 0, neutros: 0, detratores: 0, score: 0 });
});

test("calcularNps agrega e calcula o score (%promotores - %detratores)", () => {
  // 6 promotores, 2 neutros, 2 detratores (total 10) -> (60 - 20) = 40
  const notas = [10, 10, 9, 9, 9, 9, 8, 7, 3, 0];
  const r = calcularNps(notas);
  assert.equal(r.total, 10);
  assert.equal(r.promotores, 6);
  assert.equal(r.neutros, 2);
  assert.equal(r.detratores, 2);
  assert.equal(r.score, 40);
});

test("calcularNps ignora notas invalidas (fora de 0-10 ou nao numericas) e aceita string", () => {
  const r = calcularNps([9, "10", 7, -1, 11, null, undefined, "x"]);
  assert.equal(r.total, 3); // 9, 10, 7
  assert.equal(r.promotores, 2);
  assert.equal(r.neutros, 1);
  assert.equal(r.detratores, 0);
  assert.equal(r.score, 67); // round(2/3*100)
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
