import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ehUuid,
  cpfSeguro,
  montarFiltroEventosCaso,
  diasAteInicio,
  saldoPorMoedaAberto,
  estimarSaldoBRL,
} from "./caso.ts";

const UUID = "11111111-2222-3333-4444-555555555555";

test("ehUuid aceita UUID canonico e rejeita lixo", () => {
  assert.equal(ehUuid(UUID), true);
  assert.equal(ehUuid("nao-uuid"), false);
  assert.equal(ehUuid(`${UUID},alvo.eq.x`), false);
  assert.equal(ehUuid(123), false);
});

test("cpfSeguro reduz a 11 digitos ou null", () => {
  assert.equal(cpfSeguro("123.456.789-00"), "12345678900");
  assert.equal(cpfSeguro("12345678900"), "12345678900");
  assert.equal(cpfSeguro("123"), null);
  assert.equal(cpfSeguro("alvo.eq.x,detalhe->>y.eq.z"), null); // sem 11 digitos
  assert.equal(cpfSeguro(null), null);
});

test("montarFiltroEventosCaso monta termos so com valores validados", () => {
  const f = montarFiltroEventosCaso(UUID, "123.456.789-00");
  assert.equal(
    f,
    `alvo.eq.${UUID},detalhe->>titular_id.eq.${UUID},detalhe->>titularId.eq.${UUID},alvo.eq.12345678900`
  );
});

test("montarFiltroEventosCaso omite CPF invalido e nao vaza injecao", () => {
  const f = montarFiltroEventosCaso(UUID, "x,alvo.eq.qualquer");
  assert.ok(!f.includes("qualquer"));
  assert.ok(!f.includes(","+"x"));
  assert.equal(f, `alvo.eq.${UUID},detalhe->>titular_id.eq.${UUID},detalhe->>titularId.eq.${UUID}`);
});

test("montarFiltroEventosCaso lanca com titularId nao-UUID", () => {
  assert.throws(() => montarFiltroEventosCaso("nao-uuid", null));
});

test("diasAteInicio calcula diferenca em dias UTC", () => {
  assert.equal(diasAteInicio("2026-01-31", "2026-01-01"), 30);
  assert.equal(diasAteInicio("2026-01-01", "2026-01-01"), 0);
  assert.equal(diasAteInicio("2025-12-31", "2026-01-01"), -1);
  assert.equal(diasAteInicio(null, "2026-01-01"), null);
});

test("saldoPorMoedaAberto agrupa nao-pagas por moeda do contrato", () => {
  const moedas = new Map([
    ["c1", "CAD"],
    ["c2", "USD"],
  ]);
  const parcelas = [
    { contrato_id: "c1", status: "pendente", valor_atual: 100 },
    { contrato_id: "c1", status: "pago", valor_atual: 100 },
    { contrato_id: "c1", status: "atrasado", valor_atual: 50.5 },
    { contrato_id: "c2", status: "pendente", valor_atual: 200 },
  ];
  assert.deepEqual(saldoPorMoedaAberto(parcelas, moedas), { CAD: 150.5, USD: 200 });
});

test("estimarSaldoBRL converte por moeda e retorna null se faltar cotacao", () => {
  assert.equal(estimarSaldoBRL({ CAD: 100 }, { CAD: 4 }), 400);
  assert.equal(estimarSaldoBRL({ CAD: 100, BRL: 50 }, { CAD: 4 }), 450);
  assert.equal(estimarSaldoBRL({ CAD: 100, USD: 10 }, { CAD: 4 }), null);
  assert.equal(estimarSaldoBRL({}, {}), 0);
});
