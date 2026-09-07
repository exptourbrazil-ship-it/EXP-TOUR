// Testes dos helpers puros do indice de contratos. Roda com `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { statusMaisRecentePorContrato, resumoContratos } from "./contratos.ts";

test("statusMaisRecentePorContrato pega o maior criado_em por contrato", () => {
  const r = statusMaisRecentePorContrato([
    { contrato_id: "c1", status: "rascunho", criado_em: "2026-01-01T00:00:00Z" },
    { contrato_id: "c1", status: "assinado", criado_em: "2026-03-01T00:00:00Z" },
    { contrato_id: "c1", status: "enviado", criado_em: "2026-02-01T00:00:00Z" },
    { contrato_id: "c2", status: "enviado", criado_em: "2026-02-10T00:00:00Z" },
  ]);
  assert.deepEqual(r, { c1: "assinado", c2: "enviado" });
});

test("statusMaisRecentePorContrato ignora linhas sem id/status e independe da ordem", () => {
  const r = statusMaisRecentePorContrato([
    { contrato_id: "c1", status: "assinado", criado_em: "2026-03-01T00:00:00Z" },
    { contrato_id: "", status: "x", criado_em: "2026-04-01T00:00:00Z" },
    { contrato_id: "c1", status: "rascunho", criado_em: "2026-01-01T00:00:00Z" },
  ]);
  assert.deepEqual(r, { c1: "assinado" });
});

test("resumoContratos: ativos vs cancelados, status e valor por moeda", () => {
  const r = resumoContratos([
    { cancelado_em: null, assinatura_status: "assinado", valor_total: 1000, moeda: "cad" },
    { cancelado_em: null, assinatura_status: "enviado", valor_total: 500, moeda: "CAD" },
    { cancelado_em: null, assinatura_status: null, valor_total: 200, moeda: "USD" },
    { cancelado_em: "2026-05-01T00:00:00Z", assinatura_status: "assinado", valor_total: 9999, moeda: "CAD" }, // cancelado: fora do valor/status
  ]);
  assert.equal(r.total, 4);
  assert.equal(r.ativos, 3);
  assert.equal(r.cancelados, 1);
  assert.deepEqual(r.porStatusAssinatura, { assinado: 1, enviado: 1, sem: 1 });
  assert.deepEqual(r.valorPorMoeda, { CAD: 1500, USD: 200 });
});

test("resumoContratos vazio", () => {
  const r = resumoContratos([]);
  assert.deepEqual(r, { total: 0, ativos: 0, cancelados: 0, porStatusAssinatura: {}, valorPorMoeda: {} });
});
