// Testes dos helpers puros da aba Viagem. `npm test` (node --test).
import { test } from "node:test";
import assert from "node:assert/strict";
import { emergenciaDoDestino, montarLinkMapa, montarLinkSuporteWhatsApp } from "./viagem.ts";

test("emergenciaDoDestino retorna o numero certo por destino", () => {
  assert.equal(emergenciaDoDestino("canada")?.numeroEmergencia, "911");
  assert.equal(emergenciaDoDestino("nova_zelandia")?.numeroEmergencia, "111");
});

test("emergenciaDoDestino retorna null para destino nulo ou desconhecido", () => {
  assert.equal(emergenciaDoDestino(null), null);
  assert.equal(emergenciaDoDestino("marte"), null);
});

test("montarLinkMapa codifica o endereco e ignora vazio", () => {
  const link = montarLinkMapa("1055 W Hastings St, Vancouver");
  assert.ok(link!.startsWith("https://www.google.com/maps/search/?api=1&query="));
  assert.ok(link!.includes(encodeURIComponent("1055 W Hastings St, Vancouver")));
  assert.equal(montarLinkMapa(""), null);
  assert.equal(montarLinkMapa(null), null);
});

test("montarLinkSuporteWhatsApp usa o numero comercial so com digitos", () => {
  assert.equal(montarLinkSuporteWhatsApp(), "https://wa.me/17786827927");
});
