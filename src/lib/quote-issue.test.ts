import { test } from "node:test";
import assert from "node:assert/strict";
import {
  podeEmitir,
  cambioVencido,
  aplicarMarkup,
  converterPelaTaxa,
  validadePadraoISO,
  jaEmitida,
  tokenValidoFormato,
  moedaOrigemUnica,
  type PrecondicoesEmissao,
} from "./quote-issue.ts";

const base: PrecondicoesEmissao = {
  numOpcoes: 1,
  itensPorOpcao: [2],
  temValidUntil: true,
  fxNecessario: true,
  fxPresente: true,
  fxVencido: false,
  fxMoedasMisturadas: false,
  warningsBloqueantes: 0,
};

test("podeEmitir: caso feliz", () => {
  const r = podeEmitir(base);
  assert.equal(r.ok, true);
  assert.deepEqual(r.motivos, []);
});

test("podeEmitir: sem opcoes e opcao vazia", () => {
  assert.equal(podeEmitir({ ...base, numOpcoes: 0, itensPorOpcao: [] }).ok, false);
  const r = podeEmitir({ ...base, numOpcoes: 2, itensPorOpcao: [1, 0] });
  assert.equal(r.ok, false);
  assert.match(r.motivos.join(" "), /sem itens/);
});

test("podeEmitir: sem validade", () => {
  assert.equal(podeEmitir({ ...base, temValidUntil: false }).ok, false);
});

test("podeEmitir: cambio necessario ausente/vencido/misturado", () => {
  assert.equal(podeEmitir({ ...base, fxPresente: false }).ok, false);
  assert.equal(podeEmitir({ ...base, fxVencido: true }).ok, false);
  assert.equal(podeEmitir({ ...base, fxMoedasMisturadas: true }).ok, false);
});

test("podeEmitir: cambio nao necessario ignora fx", () => {
  const r = podeEmitir({ ...base, fxNecessario: false, fxPresente: false, fxVencido: true });
  assert.equal(r.ok, true);
});

test("podeEmitir: warnings bloqueantes barram", () => {
  assert.equal(podeEmitir({ ...base, warningsBloqueantes: 1 }).ok, false);
});

test("cambioVencido: ausente conta como vencido", () => {
  assert.equal(cambioVencido(null, 1_000_000, 24), true);
});

test("cambioVencido: dentro e fora da janela", () => {
  const agora = 100 * 3600 * 1000;
  const dentro = agora - 23 * 3600 * 1000;
  const fora = agora - 25 * 3600 * 1000;
  assert.equal(cambioVencido(dentro, agora, 24), false);
  assert.equal(cambioVencido(fora, agora, 24), true);
});

test("cambioVencido: taxa do futuro nao e vencida", () => {
  assert.equal(cambioVencido(200 * 3600 * 1000, 100 * 3600 * 1000, 24), false);
});

test("aplicarMarkup: spread de 6,6% e arredondamento de 8 casas", () => {
  assert.equal(aplicarMarkup(3.5, 6.6), 3.731);
  assert.equal(aplicarMarkup(4.2024, 0), 4.2024);
  assert.equal(aplicarMarkup(3.5, -1), 3.5); // markup invalido = 0
});

test("converterPelaTaxa: 2 casas e defesa de taxa invalida", () => {
  assert.equal(converterPelaTaxa(1000, 3.731), 3731);
  assert.equal(converterPelaTaxa(1000, 0), 0);
});

test("validadePadraoISO: soma dias sem escorregar fuso", () => {
  assert.equal(validadePadraoISO("2026-08-22", 15), "2026-09-06");
  assert.equal(validadePadraoISO("2026-12-31", 1), "2027-01-01");
  assert.equal(validadePadraoISO("2026-08-22", 0), "2026-08-22");
});

test("jaEmitida: estados a partir de issued", () => {
  assert.equal(jaEmitida("draft"), false);
  assert.equal(jaEmitida("issued"), true);
  assert.equal(jaEmitida("viewed"), true);
  assert.equal(jaEmitida("option_selected"), true);
  assert.equal(jaEmitida("cancelled"), false);
});

test("tokenValidoFormato: 43 chars base64url", () => {
  assert.equal(tokenValidoFormato("A".repeat(43)), true);
  assert.equal(tokenValidoFormato("A".repeat(42)), false);
  assert.equal(tokenValidoFormato("A".repeat(43) + "="), false);
  assert.equal(tokenValidoFormato("abc/def" + "A".repeat(36)), false); // '/' nao e base64url
});

test("moedaOrigemUnica: unica, mistura e vazio", () => {
  assert.equal(moedaOrigemUnica(["CAD", "CAD"], "BRL"), "CAD");
  assert.equal(moedaOrigemUnica(["CAD", "EUR"], "BRL"), null);
  assert.equal(moedaOrigemUnica([], "BRL"), "BRL");
});
