// Testes do módulo puro de fornecedor (vocabulário + indicadores).
// Roda com o runner nativo do Node: `npm test` (node --test), sem dependências.
import { test } from "node:test";
import assert from "node:assert/strict";
import { resumoFornecedores, FORNECEDOR_STATUS, FORNECEDOR_STATUS_LABEL } from "./fornecedor.ts";

test("resumoFornecedores conta conectados, com acesso e preferidos", () => {
  const r = resumoFornecedores([
    { status: "connected", preferido: true, temAcesso: true },
    { status: "connected", preferido: false, temAcesso: false },
    { status: "prospect", preferido: false, temAcesso: true },
    { status: "paused", preferido: true, temAcesso: false },
  ]);
  assert.equal(r.total, 4);
  assert.equal(r.conectados, 2);
  assert.equal(r.comAcesso, 2);
  assert.equal(r.preferidos, 2);
});

test("resumoFornecedores lista vazia zera tudo", () => {
  assert.deepEqual(resumoFornecedores([]), { total: 0, conectados: 0, comAcesso: 0, preferidos: 0 });
});

test("todo status do vocabulário tem rótulo", () => {
  for (const s of FORNECEDOR_STATUS) {
    assert.ok(FORNECEDOR_STATUS_LABEL[s], `esperava rótulo para ${s}`);
  }
});
