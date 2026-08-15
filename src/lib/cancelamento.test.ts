import test from "node:test";
import assert from "node:assert/strict";

import { contratoCancelado, removerDeContratosCancelados, rotuloTipoCancelamento, TIPOS_CANCELAMENTO } from "./cancelamento.ts";

test("contrato sem data de cancelamento esta ativo", () => {
  assert.equal(contratoCancelado(null), false);
  assert.equal(contratoCancelado(undefined), false);
  assert.equal(contratoCancelado({}), false);
  assert.equal(contratoCancelado({ cancelado_em: null }), false);
});

test("qualquer data conta como cancelado, inclusive retroativa", () => {
  // O cancelamento costuma ser comunicado dias antes de alguem registrar, entao
  // a data efetiva pode estar no passado — e ainda assim vale.
  assert.equal(contratoCancelado({ cancelado_em: "2020-01-01T00:00:00Z" }), true);
  assert.equal(contratoCancelado({ cancelado_em: new Date().toISOString() }), true);
});

test("a regua nao envia para parcela de contrato cancelado", () => {
  const parcelas = [
    { id: "a", contrato: { cancelado_em: null } },
    { id: "b", contrato: { cancelado_em: "2026-08-14T12:00:00Z" } },
    { id: "c", contrato: null },
    { id: "d", contrato: {} },
  ];
  assert.deepEqual(removerDeContratosCancelados(parcelas).map((p) => p.id), ["a", "c", "d"]);
});

test("rotulo cai para um texto neutro quando o tipo e desconhecido", () => {
  assert.equal(rotuloTipoCancelamento("arrependimento"), "Direito de arrependimento (7 dias)");
  assert.equal(rotuloTipoCancelamento("xpto"), "Cancelado");
  assert.equal(rotuloTipoCancelamento(null), "Cancelado");
});

test("todo tipo tem rotulo e ajuda preenchidos", () => {
  for (const t of TIPOS_CANCELAMENTO) {
    assert.ok(t.rotulo.length > 0, t.valor);
    assert.ok(t.ajuda.length > 0, t.valor);
  }
});
