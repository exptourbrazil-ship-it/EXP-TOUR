// Testes do helper puro do Termo de Adesão. Roda com `npm test` (node --test).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calcularHashTermo,
  prazoArrependimentoISO,
  dentroDoPrazoArrependimento,
} from "./termos.ts";

test("calcularHashTermo: SHA-256 hex conhecido", () => {
  // sha256("abc") — valor de referência.
  assert.equal(
    calcularHashTermo("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
  );
});

test("calcularHashTermo: determinístico (mesmo texto, mesmo hash)", () => {
  const t = "Termo de Adesão versão 1\nCláusula 1...";
  assert.equal(calcularHashTermo(t), calcularHashTermo(t));
});

test("calcularHashTermo: normaliza CRLF/LF (não muda por quebra de linha do SO)", () => {
  assert.equal(calcularHashTermo("linha1\r\nlinha2"), calcularHashTermo("linha1\nlinha2"));
});

test("calcularHashTermo: textos diferentes => hashes diferentes", () => {
  assert.notEqual(calcularHashTermo("versão A"), calcularHashTermo("versão B"));
});

test("prazoArrependimentoISO: aceite + 7 dias", () => {
  assert.equal(prazoArrependimentoISO("2026-07-01T12:00:00.000Z"), "2026-07-08T12:00:00.000Z");
});

test("dentroDoPrazoArrependimento: dentro e fora da janela de 7 dias", () => {
  const aceite = "2026-07-01T12:00:00.000Z";
  assert.equal(dentroDoPrazoArrependimento(aceite, "2026-07-01T12:00:00.000Z"), true); // mesmo instante
  assert.equal(dentroDoPrazoArrependimento(aceite, "2026-07-05T00:00:00.000Z"), true); // 4 dias
  assert.equal(dentroDoPrazoArrependimento(aceite, "2026-07-08T12:00:00.000Z"), true); // limite exato
  assert.equal(dentroDoPrazoArrependimento(aceite, "2026-07-08T12:00:01.000Z"), false); // 1s após
  assert.equal(dentroDoPrazoArrependimento(aceite, "2026-07-20T00:00:00.000Z"), false); // muito depois
});
