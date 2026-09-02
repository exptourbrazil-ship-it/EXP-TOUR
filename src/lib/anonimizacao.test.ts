// Testes do motor puro de anonimizacao (LGPD art. 18) — elegibilidade.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  contratoEncerrado,
  avaliarElegibilidade,
  CAMPOS_PII,
  TOMBSTONE,
  type ContratoParaAnonimizar,
} from "./anonimizacao.ts";

const HOJE = "2026-06-01";

function ct(over: Partial<ContratoParaAnonimizar> & { id: string }): ContratoParaAnonimizar {
  return { canceladoEm: null, temParcelaEmAberto: false, dataInicio: "2026-01-01", ...over };
}

// A1 — contrato cancelado esta encerrado (mesmo com parcela em aberto).
test("A1 cancelado -> encerrado", () => {
  assert.equal(contratoEncerrado(ct({ id: "a", canceladoEm: "2026-03-01", temParcelaEmAberto: true }), HOJE), true);
});

// A2 — quitado e programa iniciado -> encerrado.
test("A2 quitado + iniciado -> encerrado", () => {
  assert.equal(contratoEncerrado(ct({ id: "a", temParcelaEmAberto: false, dataInicio: "2026-02-01" }), HOJE), true);
});

// A3 — parcela em aberto -> ATIVO (nao encerrado).
test("A3 parcela em aberto -> ativo", () => {
  assert.equal(contratoEncerrado(ct({ id: "a", temParcelaEmAberto: true }), HOJE), false);
});

// A4 — programa no futuro -> ATIVO.
test("A4 programa nao iniciado -> ativo", () => {
  assert.equal(contratoEncerrado(ct({ id: "a", temParcelaEmAberto: false, dataInicio: "2026-12-01" }), HOJE), false);
});

// A5 — sem data_inicio e nao cancelado -> ATIVO (falha fechada: so cancelamento encerra).
test("A5 sem data_inicio -> ativo", () => {
  assert.equal(contratoEncerrado(ct({ id: "a", temParcelaEmAberto: false, dataInicio: null }), HOJE), false);
});

// A6 — elegivel so quando TODOS encerrados; lista os ativos.
test("A6 elegibilidade agrega os ativos", () => {
  const ok = avaliarElegibilidade(
    [ct({ id: "a", canceladoEm: "2026-01-01" }), ct({ id: "b", temParcelaEmAberto: false, dataInicio: "2026-02-01" })],
    HOJE,
  );
  assert.equal(ok.ok, true);

  const bloq = avaliarElegibilidade(
    [ct({ id: "a", canceladoEm: "2026-01-01" }), ct({ id: "b", temParcelaEmAberto: true })],
    HOJE,
  );
  assert.equal(bloq.ok, false);
  if (!bloq.ok) {
    assert.equal(bloq.motivo, "contrato_ativo");
    assert.deepEqual(bloq.contratosAtivos, ["b"]);
  }
});

// A7 — titular sem contratos e elegivel.
test("A7 sem contratos -> elegivel", () => {
  assert.equal(avaliarElegibilidade([], HOJE).ok, true);
});

// A8 — o catalogo de PII cobre titulares/contratos/consentimentos e os IPs de prova.
test("A8 catalogo de PII", () => {
  assert.ok(CAMPOS_PII.titulares.includes("cpf"));
  assert.ok(CAMPOS_PII.titulares.includes("nome_completo"));
  assert.ok(CAMPOS_PII.titulares.includes("email")); // canal de login — nao pode sobreviver
  assert.ok(CAMPOS_PII.contratos.includes("estudante_nome"));
  assert.ok(CAMPOS_PII.contratos.includes("quadro_resumo")); // snapshot com PII
  assert.ok(CAMPOS_PII.consentimentos.includes("ip"));
  assert.ok(CAMPOS_PII.repactuacoes.includes("ip"));
  assert.ok(CAMPOS_PII.aceites.includes("ip"));
  assert.equal(TOMBSTONE, "[anonimizado]");
});
