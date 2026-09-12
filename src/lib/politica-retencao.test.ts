import { test } from "node:test";
import assert from "node:assert/strict";
import {
  metricaRestante,
  selecionarDegrau,
  calcularRetencaoCampus,
  type PoliticaRetencao,
  type DegrauRetencao,
} from "./politica-retencao.ts";

// Escada exemplo: >60 -> 0%; (30,60] -> 25%; (0,30] -> 50%; <=0 (dentro) -> 100%.
const DEGRAUS: DegrauRetencao[] = [
  { ate: 0, retencaoPercentual: 1.0, rotulo: "Após o início" },
  { ate: 30, retencaoPercentual: 0.5, rotulo: "Menos de 30" },
  { ate: 60, retencaoPercentual: 0.25, rotulo: "30 a 60" },
  { ate: null, retencaoPercentual: 0.0, rotulo: "Mais de 60" },
];

function pol(over: Partial<PoliticaRetencao> = {}): PoliticaRetencao {
  return { ancora: "inicio_curso", unidade: "dias_corridos", degraus: DEGRAUS, moeda: "CAD", ...over };
}

// ---- métrica ----

test("metricaRestante dias_corridos: distância até a âncora", () => {
  assert.equal(metricaRestante("dias_corridos", { ancoraISO: "2026-10-01", cancelamentoISO: "2026-09-01" }), 30);
  assert.equal(metricaRestante("dias_corridos", { ancoraISO: "2026-10-01", cancelamentoISO: "2026-08-01" }), 61);
});

test("metricaRestante: cancelamento na âncora ou depois -> 0", () => {
  assert.equal(metricaRestante("dias_corridos", { ancoraISO: "2026-10-01", cancelamentoISO: "2026-10-01" }), 0);
  assert.equal(metricaRestante("dias_corridos", { ancoraISO: "2026-10-01", cancelamentoISO: "2026-10-15" }), 0);
});

test("metricaRestante semanas: dias/7 (floor)", () => {
  assert.equal(metricaRestante("semanas", { ancoraISO: "2026-10-01", cancelamentoISO: "2026-09-01" }), 4); // 30/7 = 4
});

test("metricaRestante dias_uteis: conta úteis restantes, pula fds/feriado", () => {
  // (2026-09-04 sexta, cancelamento) até 2026-09-11 sexta: úteis restantes 07,08,09,10,11 = 5.
  assert.equal(metricaRestante("dias_uteis", { ancoraISO: "2026-09-11", cancelamentoISO: "2026-09-04" }), 5);
  // Com feriado na 07 -> 4.
  assert.equal(
    metricaRestante("dias_uteis", { ancoraISO: "2026-09-11", cancelamentoISO: "2026-09-04", feriados: new Set(["2026-09-07"]) }),
    4,
  );
});

test("metricaRestante percent_horas: % de horas RESTANTES", () => {
  assert.equal(metricaRestante("percent_horas", { horasCumpridas: 25, horasTotais: 100 }), 75);
  assert.equal(metricaRestante("percent_horas", { horasCumpridas: 100, horasTotais: 100 }), 0);
  assert.equal(metricaRestante("percent_horas", { horasCumpridas: 0, horasTotais: 0 }), null); // sem base
});

test("metricaRestante sem datas -> null", () => {
  assert.equal(metricaRestante("dias_corridos", { ancoraISO: null, cancelamentoISO: "2026-09-01" }), null);
});

// ---- seleção de degrau ----

test("selecionarDegrau escolhe o menor `ate` que comporta a métrica", () => {
  assert.equal(selecionarDegrau(DEGRAUS, 0)?.retencaoPercentual, 1.0); // dentro
  assert.equal(selecionarDegrau(DEGRAUS, 20)?.retencaoPercentual, 0.5); // <=30
  assert.equal(selecionarDegrau(DEGRAUS, 30)?.retencaoPercentual, 0.5); // limite inclusivo do bucket
  assert.equal(selecionarDegrau(DEGRAUS, 45)?.retencaoPercentual, 0.25); // <=60
  assert.equal(selecionarDegrau(DEGRAUS, 90)?.retencaoPercentual, 0.0); // sem limite
  assert.equal(selecionarDegrau(DEGRAUS, null), null);
});

// ---- cálculo + teto/mínimo + memória ----

test("calcularRetencaoCampus: percentual do degrau sobre a base", () => {
  const r = calcularRetencaoCampus(pol(), { base: 1000, metricaRestante: 20 });
  assert.equal(r.retencaoPercentual, 0.5);
  assert.equal(r.retencaoBruta, 500);
  assert.equal(r.totalRetido, 500);
  assert.equal(r.degrau?.rotulo, "Menos de 30");
});

test("calcularRetencaoCampus: teto limita o retido", () => {
  const r = calcularRetencaoCampus(pol({ teto: 300 }), { base: 1000, metricaRestante: 20 });
  assert.equal(r.retencaoBruta, 500);
  assert.equal(r.tetoAtingido, true);
  assert.equal(r.totalRetido, 300);
});

test("calcularRetencaoCampus: mínimo eleva o retido", () => {
  const r = calcularRetencaoCampus(pol({ minimo: 400 }), { base: 1000, metricaRestante: 90 }); // degrau 0%
  assert.equal(r.retencaoBruta, 0);
  assert.equal(r.minimoAplicado, true);
  assert.equal(r.totalRetido, 400);
});

test("calcularRetencaoCampus: degrau de valor fixo ignora a base", () => {
  const degraus: DegrauRetencao[] = [{ ate: 30, retencaoValor: 250 }, { ate: null, retencaoPercentual: 0 }];
  const r = calcularRetencaoCampus(pol({ degraus }), { base: 1000, metricaRestante: 10 });
  assert.equal(r.retencaoPercentual, 0);
  assert.equal(r.retencaoBruta, 250);
  assert.equal(r.totalRetido, 250);
});

test("calcularRetencaoCampus: memória traz base, métrica, degrau e total", () => {
  const r = calcularRetencaoCampus(pol(), { base: 1000, metricaRestante: 20 });
  const rotulos = r.memoria.map((l) => l.rotulo);
  assert.ok(rotulos.some((x) => x.startsWith("Base de cálculo")));
  assert.ok(rotulos.some((x) => x.includes("Faltam para a âncora")));
  assert.ok(rotulos.some((x) => x === "Total retido pelo fornecedor"));
});
