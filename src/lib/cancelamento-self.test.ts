import { test } from "node:test";
import assert from "node:assert/strict";
import {
  alternativasAplicaveis,
  dentroDoArrependimento,
  parseValorBRL,
  confirmacaoValorConfere,
  motivoValido,
} from "./cancelamento-self.ts";

test("alternativas: antes do início oferece adiar/trocar/repactuar + consultor", () => {
  const a = alternativasAplicaveis({ jaComecou: false, cancelado: false }).map((x) => x.chave);
  assert.deepEqual(a, ["adiar_data", "trocar_destino", "repactuar", "falar_consultor"]);
});

test("alternativas: depois do início só sobra falar com consultor", () => {
  const a = alternativasAplicaveis({ jaComecou: true, cancelado: false }).map((x) => x.chave);
  assert.deepEqual(a, ["falar_consultor"]);
});

test("dentroDoArrependimento: true dentro da janela, false fora/sem carimbo", () => {
  assert.equal(dentroDoArrependimento("2026-09-20T00:00:00Z", "2026-09-18T00:00:00Z"), true);
  assert.equal(dentroDoArrependimento("2026-09-20T00:00:00Z", "2026-09-25T00:00:00Z"), false);
  assert.equal(dentroDoArrependimento(null, "2026-09-18T00:00:00Z"), false);
});

test("parseValorBRL entende formatos BR e internacional", () => {
  assert.equal(parseValorBRL("1.234,56"), 1234.56);
  assert.equal(parseValorBRL("1234,56"), 1234.56);
  assert.equal(parseValorBRL("1234.56"), 1234.56);
  assert.equal(parseValorBRL("R$ 1.200,00"), 1200);
  assert.equal(parseValorBRL("1200"), 1200);
  assert.equal(parseValorBRL(1200), 1200);
  assert.equal(parseValorBRL("abc"), null);
  assert.equal(parseValorBRL(""), null);
});

test("confirmacaoValorConfere: bate dentro da tolerância, recusa fora", () => {
  assert.equal(confirmacaoValorConfere("1200,00", 1200), true);
  assert.equal(confirmacaoValorConfere("1200", 1200.3), true); // <= 0.5 default
  assert.equal(confirmacaoValorConfere("1199,00", 1200), false); // 1 real de diferença
  assert.equal(confirmacaoValorConfere("abc", 1200), false);
  assert.equal(confirmacaoValorConfere("1200,50", 1200, 0.01), false); // tolerância estrita
});

test("motivoValido", () => {
  assert.equal(motivoValido("financeiro"), true);
  assert.equal(motivoValido("inexistente"), false);
});
