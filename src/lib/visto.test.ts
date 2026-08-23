// Testes do vocabulario de status do visto e do gatilho do E1.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STATUS_VISTO,
  statusVistoValido,
  labelStatusVisto,
  disparaExcecaoVistoNegado,
} from "./visto.ts";

test("statusVistoValido aceita so os status conhecidos", () => {
  for (const s of STATUS_VISTO) assert.equal(statusVistoValido(s), true);
  assert.equal(statusVistoValido("aprovadoo"), false);
  assert.equal(statusVistoValido(""), false);
  assert.equal(statusVistoValido(null), false);
  assert.equal(statusVistoValido(123), false);
});

test("labelStatusVisto", () => {
  assert.equal(labelStatusVisto("negado"), "Negado");
  assert.equal(labelStatusVisto(null), "Não informado");
  assert.equal(labelStatusVisto("xpto"), "xpto");
});

test("disparaExcecaoVistoNegado: so na TRANSICAO para negado", () => {
  assert.equal(disparaExcecaoVistoNegado(null, "negado"), true);
  assert.equal(disparaExcecaoVistoNegado("em_analise", "negado"), true);
  assert.equal(disparaExcecaoVistoNegado("aprovado", "negado"), true);
  // ja estava negado -> nao redispara
  assert.equal(disparaExcecaoVistoNegado("negado", "negado"), false);
  // outros destinos nao disparam
  assert.equal(disparaExcecaoVistoNegado("negado", "aprovado"), false);
  assert.equal(disparaExcecaoVistoNegado(null, "aprovado"), false);
  assert.equal(disparaExcecaoVistoNegado("em_analise", "em_analise"), false);
});
