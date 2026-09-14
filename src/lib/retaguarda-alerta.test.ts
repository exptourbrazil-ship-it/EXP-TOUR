import { test } from "node:test";
import assert from "node:assert/strict";
import { montarResumoAlertaRetaguarda } from "./retaguarda-alerta.ts";

test("sem novos -> null (nao envia)", () => {
  assert.equal(montarResumoAlertaRetaguarda({ novos: [], marca: "Forio" }), null);
});

test("assunto tem contagem e marca; corpo lista os resumos", () => {
  const r = montarResumoAlertaRetaguarda({
    novos: [
      { categoria: "parcela_paga_sem_lastro", resumo: "Parcela p1 esta 'pago' sem lastro." },
      { categoria: "pagamento_sem_parcela_paga", resumo: "Pagamento mp2 sem parcela conciliada." },
    ],
    marca: "Forio",
  });
  assert.ok(r);
  assert.equal(r!.assunto, "2 achado(s) ALTO de retaguarda — Forio");
  assert.match(r!.texto, /Parcela p1 esta 'pago' sem lastro\./);
  assert.match(r!.texto, /Pagamento mp2 sem parcela conciliada\./);
  assert.match(r!.texto, /apenas sinaliza/);
});

test("link absoluto com appUrl", () => {
  const r = montarResumoAlertaRetaguarda({
    novos: [{ categoria: "x", resumo: "y" }],
    marca: "Forio",
    appUrl: "https://forio.example.com/",
  });
  assert.ok(r);
  assert.match(r!.texto, /https:\/\/forio\.example\.com\/admin\/retaguarda/);
});
