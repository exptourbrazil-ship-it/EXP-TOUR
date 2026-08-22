// Testes do modelo de papeis (RBAC) da Area Administrativa.
// Roda com o runner nativo do Node: `npm test` (node --test), sem dependencias.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PAPEIS_ADMIN,
  CAPACIDADES_ADMIN,
  papelValido,
  podeAdmin,
  PAPEL_LABEL,
} from "./admin-roles.ts";

test("papelValido aceita os 4 papeis e rejeita o resto", () => {
  for (const p of PAPEIS_ADMIN) assert.equal(papelValido(p), true);
  assert.equal(papelValido("admin"), false);
  assert.equal(papelValido(""), false);
  assert.equal(papelValido(null), false);
  assert.equal(papelValido(undefined), false);
  assert.equal(papelValido(123), false);
});

test("todo papel tem um rotulo de UI", () => {
  for (const p of PAPEIS_ADMIN) assert.ok(PAPEL_LABEL[p] && PAPEL_LABEL[p].length > 0);
});

test("Gestor pode TODAS as capacidades", () => {
  for (const c of CAPACIDADES_ADMIN) {
    assert.equal(podeAdmin("gestor", c), true, `gestor deveria poder ${c}`);
  }
});

test("Operacao: documentos e fornecedores sim; financeiro e config nao", () => {
  assert.equal(podeAdmin("operacao", "casos.ver"), true);
  assert.equal(podeAdmin("operacao", "documentos.analisar"), true);
  assert.equal(podeAdmin("operacao", "fornecedores.gerir"), true);
  assert.equal(podeAdmin("operacao", "financeiro.gerir"), false);
  assert.equal(podeAdmin("operacao", "financeiro.ver"), false);
  assert.equal(podeAdmin("operacao", "config.gerir"), false);
  assert.equal(podeAdmin("operacao", "override"), false);
});

test("Financeiro: dinheiro sim; documentos e config nao", () => {
  assert.equal(podeAdmin("financeiro", "casos.ver"), true);
  assert.equal(podeAdmin("financeiro", "financeiro.ver"), true);
  assert.equal(podeAdmin("financeiro", "financeiro.gerir"), true);
  assert.equal(podeAdmin("financeiro", "documentos.analisar"), false);
  assert.equal(podeAdmin("financeiro", "config.gerir"), false);
});

test("Consultor: propostas e casos sim; financeiro e config nao", () => {
  assert.equal(podeAdmin("consultor", "casos.ver"), true);
  assert.equal(podeAdmin("consultor", "propostas.gerir"), true);
  assert.equal(podeAdmin("consultor", "financeiro.ver"), false);
  assert.equal(podeAdmin("consultor", "financeiro.gerir"), false);
  assert.equal(podeAdmin("consultor", "config.gerir"), false);
});

test("config, usuarios e override sao exclusivos do Gestor", () => {
  for (const p of ["operacao", "financeiro", "consultor"] as const) {
    assert.equal(podeAdmin(p, "config.gerir"), false);
    assert.equal(podeAdmin(p, "usuarios.gerir"), false);
    assert.equal(podeAdmin(p, "override"), false);
  }
});
