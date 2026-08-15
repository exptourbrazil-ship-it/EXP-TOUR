import test from "node:test";
import assert from "node:assert/strict";

import { agruparPorCausa, montarResumoAlerta } from "./alerta-eventos.ts";

const ev = (over: any = {}) => ({
  source: "mercadopago",
  event_type: "payment",
  external_id: "1",
  erro: "Assinatura invalida",
  tentativas: 1,
  updated_at: "2026-08-15T10:00:00Z",
  ...over,
});

test("vinte falhas pela mesma causa viram uma linha, nao vinte", () => {
  // Era este o risco: uma enxurrada de notificacoes rejeitadas pelo mesmo
  // motivo esconderia um segundo problema no meio.
  const grupos = agruparPorCausa(Array.from({ length: 20 }, (_, i) => ev({ external_id: String(i) })));
  assert.equal(grupos.length, 1);
  assert.equal(grupos[0].quantidade, 20);
});

test("causas diferentes ficam separadas e ordenadas pela mais frequente", () => {
  const grupos = agruparPorCausa([
    ev({ erro: "Falha ao consultar" }),
    ev({ erro: "Assinatura invalida" }),
    ev({ erro: "Assinatura invalida" }),
  ]);
  assert.equal(grupos.length, 2);
  assert.equal(grupos[0].quantidade, 2);
  assert.match(grupos[0].chave, /Assinatura invalida/);
});

test("origens diferentes nao sao agrupadas juntas", () => {
  const grupos = agruparPorCausa([ev(), ev({ source: "zoho_sign", event_type: "assinatura" })]);
  assert.equal(grupos.length, 2);
});

test("evento sem mensagem de erro nao quebra o resumo", () => {
  const texto = montarResumoAlerta([ev({ erro: null, external_id: null })], 24);
  assert.match(texto, /sem mensagem/);
  assert.match(texto, /1 evento\(s\)/);
});

test("o resumo cita a causa mais comum do incidente real", () => {
  const texto = montarResumoAlerta([ev()], 24);
  assert.match(texto, /MERCADOPAGO_WEBHOOK_SECRET/);
  assert.match(texto, /admin\/sistema/);
});
