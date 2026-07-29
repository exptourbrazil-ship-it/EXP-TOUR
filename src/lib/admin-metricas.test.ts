// Testes dos helpers puros de metricas financeiras do painel admin.
// Roda com o runner nativo do Node: `npm test` (node --test).
import { test } from "node:test";
import assert from "node:assert/strict";
import { adicionarDias, calcularMetricas } from "./admin-metricas.ts";
import type { ParcelaMetrica, PagamentoMetrica } from "./admin-metricas.ts";

const HOJE = "2026-07-29";

// Atalho para montar uma parcela nao paga.
function parc(
  vencimento: string,
  valor: number,
  moeda = "CAD",
  status = "pendente"
): ParcelaMetrica {
  return { vencimento, valor_atual: valor, moeda, status };
}

test("adicionarDias soma dias em calendario (UTC), inclusive virando o mes", () => {
  assert.equal(adicionarDias("2026-07-29", 7), "2026-08-05");
  assert.equal(adicionarDias("2026-07-29", 0), "2026-07-29");
  assert.equal(adicionarDias("2026-02-28", 1), "2026-03-01"); // 2026 nao e bissexto
});

test("recebidoMesBRL soma apenas pagamentos do mes de referencia", () => {
  const pagamentos: PagamentoMetrica[] = [
    { valor_brl: 1000, pago_em: "2026-07-01T10:00:00Z" },
    { valor_brl: 500.5, pago_em: "2026-07-28T23:00:00Z" },
    { valor_brl: 999, pago_em: "2026-06-30T10:00:00Z" }, // mes anterior: ignora
    { valor_brl: 200, pago_em: "2026-08-01T00:00:00Z" }, // mes seguinte: ignora
  ];
  const m = calcularMetricas([], pagamentos, HOJE);
  assert.equal(m.recebidoMesBRL, 1500.5);
});

test("parcelas pagas nao entram em nenhum resumo em aberto", () => {
  const parcelas: ParcelaMetrica[] = [
    parc("2026-07-10", 400, "CAD", "pago"),
    parc("2026-08-10", 400, "CAD", "pago"),
  ];
  const m = calcularMetricas(parcelas, [], HOJE);
  assert.equal(m.aReceber.count, 0);
  assert.equal(m.emAtraso.count, 0);
  assert.equal(m.vencendo7d.count, 0);
  assert.deepEqual(m.aReceber.porMoeda, {});
});

test("classifica atrasado, vencendo em 7 dias e futuro corretamente", () => {
  const parcelas: ParcelaMetrica[] = [
    parc("2026-07-20", 100), // vencida -> atraso
    parc("2026-07-29", 200), // hoje -> vencendo7d (limite inferior inclusivo)
    parc("2026-08-05", 300), // hoje+7 -> vencendo7d (limite superior inclusivo)
    parc("2026-08-06", 400), // hoje+8 -> futuro (nem atraso nem vencendo7d)
  ];
  const m = calcularMetricas(parcelas, [], HOJE);

  // aReceber inclui TODAS as nao pagas.
  assert.equal(m.aReceber.count, 4);
  assert.deepEqual(m.aReceber.porMoeda, { CAD: 1000 });

  assert.equal(m.emAtraso.count, 1);
  assert.deepEqual(m.emAtraso.porMoeda, { CAD: 100 });

  assert.equal(m.vencendo7d.count, 2);
  assert.deepEqual(m.vencendo7d.porMoeda, { CAD: 500 });
});

test("atraso independe do status gravado (pendente vencido conta como atraso)", () => {
  const parcelas: ParcelaMetrica[] = [
    parc("2026-07-01", 150, "CAD", "pendente"), // vencida mas status 'pendente'
  ];
  const m = calcularMetricas(parcelas, [], HOJE);
  assert.equal(m.emAtraso.count, 1);
  assert.deepEqual(m.emAtraso.porMoeda, { CAD: 150 });
});

test("agrupa valores por moeda sem somar moedas diferentes", () => {
  const parcelas: ParcelaMetrica[] = [
    parc("2026-07-20", 100, "CAD"), // atraso CAD
    parc("2026-07-15", 50, "USD"), // atraso USD
    parc("2026-08-02", 200, "CAD"), // vencendo7d CAD
  ];
  const m = calcularMetricas(parcelas, [], HOJE);
  assert.deepEqual(m.emAtraso.porMoeda, { CAD: 100, USD: 50 });
  assert.deepEqual(m.aReceber.porMoeda, { CAD: 300, USD: 50 });
  assert.deepEqual(m.vencendo7d.porMoeda, { CAD: 200 });
});

test("aceita valores em string e normaliza a moeda para maiuscula", () => {
  const parcelas: ParcelaMetrica[] = [
    { vencimento: "2026-07-20", valor_atual: "100.50", moeda: "cad", status: "pendente" },
  ];
  const m = calcularMetricas(parcelas, [], HOJE);
  assert.deepEqual(m.emAtraso.porMoeda, { CAD: 100.5 });
});
