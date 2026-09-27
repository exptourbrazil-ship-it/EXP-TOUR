// Testes do helper puro de validacao de dados bancarios do fornecedor.
// Roda com o runner nativo do Node: `npm test` (node --test), sem dependencias.
import { test } from "node:test";
import assert from "node:assert/strict";
import { validarEntradaContaBancaria } from "./supplier-bank.ts";

test("recusa sem nome do titular", () => {
  const r = validarEntradaContaBancaria({ iban: "DE89370400440532013000" });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.falhas.some((f) => f.campo === "accountHolderName"));
});

test("recusa sem nenhum identificador de conta", () => {
  const r = validarEntradaContaBancaria({ accountHolderName: "Escola X", bankName: "Banco Y" });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.falhas.some((f) => f.campo === "identificador"));
});

test("aceita com IBAN apenas", () => {
  const r = validarEntradaContaBancaria({ accountHolderName: "Escola X", iban: "DE89370400440532013000" });
  assert.equal(r.ok, true);
});

test("aceita com chave Pix apenas", () => {
  const r = validarEntradaContaBancaria({ accountHolderName: "Escola X", pixKey: "escola@exemplo.com" });
  assert.equal(r.ok, true);
});

test("aceita com conta + routing (sem os dois nao vale)", () => {
  const soConta = validarEntradaContaBancaria({ accountHolderName: "Escola X", accountNumber: "12345-6" });
  assert.equal(soConta.ok, false);

  const contaERouting = validarEntradaContaBancaria({ accountHolderName: "Escola X", accountNumber: "12345-6", routingCode: "0001" });
  assert.equal(contaERouting.ok, true);
});

test("recusa pais/moeda com formato invalido (nao alfabetico)", () => {
  const r = validarEntradaContaBancaria({ accountHolderName: "Escola X", pixKey: "x", countryCode: "5R", currency: "R1L" });
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.ok(r.falhas.some((f) => f.campo === "countryCode"));
    assert.ok(r.falhas.some((f) => f.campo === "currency"));
  }
});

test("normaliza pais/moeda para maiusculas e trunca ao tamanho esperado", () => {
  const r = validarEntradaContaBancaria({ accountHolderName: "Escola X", pixKey: "x", countryCode: "br", currency: "brl" });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.valor.country_code, "BR");
    assert.equal(r.valor.currency, "BRL");
  }
});

test("recusa observacao maior que 1000 caracteres", () => {
  const r = validarEntradaContaBancaria({ accountHolderName: "Escola X", pixKey: "x", notes: "a".repeat(1001) });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.falhas.some((f) => f.campo === "notes"));
});
