import { test } from "node:test";
import assert from "node:assert/strict";
import { derivarEtapaAnexoI, etapaValida } from "./etapa-anexo-i.ts";

// T1 — nenhum sinal -> assinatura.
test("T1 so assinatura", () => {
  assert.equal(derivarEtapaAnexoI({ entradaPaga: false, temLOA: false, vistoAprovado: false }), "assinatura");
});

// T2 — entrada paga -> entrada.
test("T2 entrada", () => {
  assert.equal(derivarEtapaAnexoI({ entradaPaga: true, temLOA: false, vistoAprovado: false }), "entrada");
});

// T3 — LOA -> loa (mais avancada que entrada).
test("T3 loa", () => {
  assert.equal(derivarEtapaAnexoI({ entradaPaga: true, temLOA: true, vistoAprovado: false }), "loa");
});

// T4 — visto aprovado -> visto_embarque (a mais avancada, vence tudo).
test("T4 visto vence", () => {
  assert.equal(derivarEtapaAnexoI({ entradaPaga: true, temLOA: true, vistoAprovado: true }), "visto_embarque");
  assert.equal(derivarEtapaAnexoI({ entradaPaga: false, temLOA: false, vistoAprovado: true }), "visto_embarque");
});

// T5 — etapaValida aceita so as chaves conhecidas.
test("T5 etapaValida", () => {
  assert.equal(etapaValida("entrada"), true);
  assert.equal(etapaValida("visto_embarque"), true);
  assert.equal(etapaValida("qualquer"), false);
  assert.equal(etapaValida(null), false);
  assert.equal(etapaValida(3), false);
});
