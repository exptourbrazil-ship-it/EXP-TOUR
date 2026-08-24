// Testes dos validadores PUROS de src/lib/cadastro-service.ts.
// Roda com o runner nativo do Node: `npm test` (node --test), sem dependencias.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizarCpf,
  validarCpf,
  validarEmail,
  normalizarTelefone,
  validarDataNascimento,
} from "./cadastro-service.ts";

// ---- normalizarCpf ----------------------------------------------------------

test("normalizarCpf mantem so os digitos", () => {
  assert.equal(normalizarCpf("529.982.247-25"), "52998224725");
  assert.equal(normalizarCpf(" 111 222 333 44 "), "11122233344");
  assert.equal(normalizarCpf(null), "");
  assert.equal(normalizarCpf(undefined), "");
});

// ---- validarCpf -------------------------------------------------------------

test("validarCpf aceita CPFs validos (com e sem mascara)", () => {
  assert.equal(validarCpf("529.982.247-25"), true);
  assert.equal(validarCpf("52998224725"), true);
  assert.equal(validarCpf("168.995.350-09"), true);
});

test("validarCpf rejeita digito verificador errado", () => {
  // Mesmo CPF valido acima com o ultimo digito trocado.
  assert.equal(validarCpf("52998224726"), false);
  // Primeiro digito verificador errado.
  assert.equal(validarCpf("52998224715"), false);
});

test("validarCpf rejeita sequencias repetidas", () => {
  assert.equal(validarCpf("00000000000"), false);
  assert.equal(validarCpf("11111111111"), false);
  assert.equal(validarCpf("99999999999"), false);
});

test("validarCpf rejeita tamanho errado ou nao numerico", () => {
  assert.equal(validarCpf("123"), false);
  assert.equal(validarCpf("5299822472"), false); // 10 digitos
  assert.equal(validarCpf("529982247250"), false); // 12 digitos
  assert.equal(validarCpf(""), false);
  assert.equal(validarCpf(null), false);
});

// ---- validarEmail -----------------------------------------------------------

test("validarEmail aceita e-mails plausiveis", () => {
  assert.equal(validarEmail("cliente@exemplo.com.br"), true);
  assert.equal(validarEmail(" pessoa@dominio.io "), true);
});

test("validarEmail rejeita formatos invalidos", () => {
  assert.equal(validarEmail("sem-arroba.com"), false);
  assert.equal(validarEmail("a@b"), false);
  assert.equal(validarEmail("a@ b.com"), false);
  assert.equal(validarEmail(""), false);
  assert.equal(validarEmail(null), false);
});

// ---- normalizarTelefone -----------------------------------------------------

test("normalizarTelefone mantem so os digitos", () => {
  assert.equal(normalizarTelefone("(11) 98888-7777"), "11988887777");
  assert.equal(normalizarTelefone("+55 11 3333-4444"), "551133334444");
  assert.equal(normalizarTelefone(null), "");
});

// ---- validarDataNascimento --------------------------------------------------

test("validarDataNascimento aceita data real e passada", () => {
  assert.equal(validarDataNascimento("1990-05-20", "2026-08-24"), true);
  assert.equal(validarDataNascimento("2000-02-29", "2026-08-24"), true); // ano bissexto
});

test("validarDataNascimento rejeita data futura", () => {
  assert.equal(validarDataNascimento("2030-01-01", "2026-08-24"), false);
});

test("validarDataNascimento rejeita formato ruim", () => {
  assert.equal(validarDataNascimento("20/05/1990", "2026-08-24"), false);
  assert.equal(validarDataNascimento("1990-5-20", "2026-08-24"), false);
  assert.equal(validarDataNascimento("", "2026-08-24"), false);
  assert.equal(validarDataNascimento(null, "2026-08-24"), false);
});

test("validarDataNascimento rejeita data inexistente e ano < 1900", () => {
  assert.equal(validarDataNascimento("2023-02-31", "2026-08-24"), false); // 31/02 nao existe
  assert.equal(validarDataNascimento("2023-13-01", "2026-08-24"), false); // mes 13
  assert.equal(validarDataNascimento("1899-12-31", "2026-08-24"), false); // ano < 1900
});
