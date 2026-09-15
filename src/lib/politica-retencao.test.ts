import { test } from "node:test";
import assert from "node:assert/strict";
import {
  metricaRestante,
  metricaDecorrida,
  metricaPorAncora,
  direcaoDaAncora,
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

// ── v3.1: âncoras assinatura/reserva (métrica DECORRIDA) ─────────────────────

test("direcaoDaAncora: assinatura/reserva = decorrido; curso/acomodação = restante", () => {
  assert.equal(direcaoDaAncora("assinatura"), "decorrido");
  assert.equal(direcaoDaAncora("reserva"), "decorrido");
  assert.equal(direcaoDaAncora("inicio_curso"), "restante");
  assert.equal(direcaoDaAncora("chegada_acomodacao"), "restante");
});

test("metricaDecorrida: dias decorridos desde a âncora; antes/na âncora = 0", () => {
  assert.equal(metricaDecorrida("dias_corridos", { ancoraISO: "2026-09-01", cancelamentoISO: "2026-09-11" }), 10);
  assert.equal(metricaDecorrida("semanas", { ancoraISO: "2026-09-01", cancelamentoISO: "2026-09-22" }), 3);
  assert.equal(metricaDecorrida("dias_corridos", { ancoraISO: "2026-09-10", cancelamentoISO: "2026-09-01" }), 0); // cancelou antes
  assert.equal(metricaDecorrida("percent_horas", { ancoraISO: "2026-09-01", cancelamentoISO: "2026-09-11" }), null);
});

test("metricaPorAncora roteia por sentido; para curso é idêntico a metricaRestante", () => {
  const ctx = { ancoraISO: "2026-12-01", cancelamentoISO: "2026-11-01", horasTotais: null, horasCumpridas: null };
  assert.equal(
    metricaPorAncora("inicio_curso", "dias_corridos", ctx),
    metricaRestante("dias_corridos", ctx),
  );
  // assinatura usa decorrida (âncora no passado)
  assert.equal(
    metricaPorAncora("assinatura", "dias_corridos", { ancoraISO: "2026-09-01", cancelamentoISO: "2026-09-09" }),
    8,
  );
});

test("VanWest: reembolso integral dentro de 7 dias da assinatura, retenção depois", () => {
  // Escada por DECORRIDO desde a assinatura: <=7 dias => 0%; depois => 100%.
  const vanwest: PoliticaRetencao = {
    ancora: "assinatura",
    unidade: "dias_corridos",
    moeda: "CAD",
    degraus: [
      { ate: 7, retencaoPercentual: 0.0, rotulo: "Até 7 dias (integral)" },
      { ate: null, retencaoPercentual: 1.0, rotulo: "Após 7 dias" },
    ],
  };
  const dentro = metricaPorAncora("assinatura", "dias_corridos", { ancoraISO: "2026-09-01", cancelamentoISO: "2026-09-04" });
  const r1 = calcularRetencaoCampus(vanwest, { base: 5000, metricaRestante: dentro, sentido: "decorrido" });
  assert.equal(r1.totalRetido, 0);
  const fora = metricaPorAncora("assinatura", "dias_corridos", { ancoraISO: "2026-09-01", cancelamentoISO: "2026-09-20" });
  const r2 = calcularRetencaoCampus(vanwest, { base: 5000, metricaRestante: fora, sentido: "decorrido" });
  assert.equal(r2.totalRetido, 5000);
  assert.ok(r2.memoria.some((l) => l.rotulo.includes("Decorridos desde a âncora")));
});

// ── v3.1: retenção por N semanas + piso do degrau ────────────────────────────

test("retenção por N semanas usa o valor semanal do ctx (curso vs tudo)", () => {
  const pol2: PoliticaRetencao = {
    ancora: "inicio_curso",
    unidade: "semanas",
    moeda: "CAD",
    degraus: [{ ate: null, retencaoSemanas: 2, retencaoSemanasBase: "curso" }],
  };
  const r = calcularRetencaoCampus(pol2, { base: 9600, metricaRestante: 3, valorSemanaCurso: 400, valorSemanaTudo: 500 });
  assert.equal(r.totalRetido, 800); // 2 semanas × 400
  assert.equal(r.retencaoPercentual, 0);
  assert.ok(r.memoria.some((l) => l.rotulo.includes("semana(s) de curso")));
});

test("piso do degrau em semanas (Anglo: mínimo 8 semanas de curso)", () => {
  const anglo: PoliticaRetencao = {
    ancora: "inicio_curso",
    unidade: "semanas",
    moeda: "GBP",
    degraus: [{ ate: null, retencaoPercentual: 0.25, minimoSemanas: 8, minimoSemanasBase: "curso" }],
  };
  // 25% de 2000 = 500, mas o piso é 8 semanas × 100 = 800 => prevalece 800.
  const r = calcularRetencaoCampus(anglo, { base: 2000, metricaRestante: 10, valorSemanaCurso: 100 });
  assert.equal(r.totalRetido, 800);
  assert.ok(r.memoria.some((l) => l.rotulo === "Ajustado ao mínimo do degrau"));
});

test("prioridade: valor fixo > n semanas > percentual", () => {
  const pol3: PoliticaRetencao = {
    ancora: "inicio_curso",
    unidade: "semanas",
    moeda: "CAD",
    degraus: [{ ate: null, retencaoValor: 300, retencaoSemanas: 2, retencaoPercentual: 0.5 }],
  };
  const r = calcularRetencaoCampus(pol3, { base: 1000, metricaRestante: 5, valorSemanaCurso: 400 });
  assert.equal(r.totalRetido, 300); // valor fixo vence
});

test("retrocompat: política pct/fixo antiga produz o MESMO resultado", () => {
  // pol() é inicio_curso/dias_corridos/pct; sem novos campos => idêntico ao legado.
  const r = calcularRetencaoCampus(pol(), { base: 1000, metricaRestante: 20 });
  assert.equal(r.totalRetido, 500); // (0,30] => 50%
  assert.equal(r.retencaoPercentual, 0.5);
});
