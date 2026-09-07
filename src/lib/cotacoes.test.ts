// Testes do helper puro da lista de cotacoes. `npm test` (node --test).
import { test } from "node:test";
import assert from "node:assert/strict";
import { resumoCotacoes } from "./cotacoes.ts";

test("resumoCotacoes agrega o funil por status", () => {
  const r = resumoCotacoes([
    { status: "draft" },
    { status: "draft" },
    { status: "issued" },
    { status: "viewed" },
    { status: "option_selected" },
    { status: "converted" },
    { status: "expired" },
    { status: "cancelled" },
    { status: "desconhecido" }, // não quebra; só conta no total
  ]);
  assert.equal(r.total, 9);
  assert.equal(r.rascunhos, 2);
  assert.equal(r.emitidas, 3); // issued + viewed + option_selected
  assert.equal(r.opcaoEscolhida, 1);
  assert.equal(r.convertidas, 1);
  assert.equal(r.encerradas, 2);
});

test("resumoCotacoes vazio", () => {
  assert.deepEqual(resumoCotacoes([]), {
    total: 0,
    rascunhos: 0,
    emitidas: 0,
    opcaoEscolhida: 0,
    convertidas: 0,
    encerradas: 0,
  });
});
