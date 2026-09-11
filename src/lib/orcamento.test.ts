// Testes do nucleo puro do orcamento lead-facing.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizar,
  expandirTermos,
  filtrarProgramas,
  montarOrcamento,
  converterBRL,
  planoPix,
  calcularNTrimestre,
  trimestresDisponiveis,
  simularParcelamento,
  type ProgramaOrcavel,
} from "./orcamento.ts";

function prog(over: Partial<ProgramaOrcavel> & { id: string }): ProgramaOrcavel {
  return {
    slug: over.id, courseName: "General English", courseType: "english-for-specific-purposes",
    city: "London", country: "UK", school: "LSI Education", currency: "GBP",
    minWeeks: 1, maxWeeks: 12, fixedFee: false, wfee: 340, appFee: 100, wmatFee: 0,
    accom: { residence: 485, homestay: 133 }, insuranceWeekly: 14, ...over,
  };
}

test("normalizar remove acentos e caixa", () => {
  assert.equal(normalizar("Médico  "), "medico");
  assert.equal(normalizar("AVIAÇÃO"), "aviacao");
});

test("expandirTermos: medico -> palavras EN", () => {
  const t = expandirTermos("médico");
  assert.ok(t.includes("medical") && t.includes("nursing"));
});

test("filtrarProgramas: termo casa no nome do curso", () => {
  const programas = [
    prog({ id: "a", courseName: "Medical English" }),
    prog({ id: "b", courseName: "Legal English" }),
  ];
  const r = filtrarProgramas({ programas, termo: "médico", weeks: 4 });
  assert.deepEqual(r.resultados.map((p) => p.id), ["a"]);
});

test("filtrarProgramas: coringa profissional inclui english-for-professionals", () => {
  const programas = [
    prog({ id: "p", courseName: "Speak-up", courseType: "english-for-professionals" }),
    prog({ id: "x", courseName: "English for Childcare" }),
  ];
  const r = filtrarProgramas({ programas, termo: "reunião com chefe", weeks: 4 });
  assert.deepEqual(r.resultados.map((p) => p.id), ["p"]);
});

test("filtrarProgramas: fora da faixa de semanas vira aviso, nao resultado", () => {
  const programas = [prog({ id: "a", courseName: "Medical English", minWeeks: 8, maxWeeks: 12 })];
  const r = filtrarProgramas({ programas, termo: "médico", weeks: 4 });
  assert.equal(r.resultados.length, 0);
  assert.equal(r.foraDaFaixa.length, 1);
  assert.equal(r.foraDaFaixa[0].minWeeks, 8);
});

test("filtrarProgramas: termo vazio devolve tudo na faixa/pais", () => {
  const programas = [prog({ id: "a", country: "UK" }), prog({ id: "b", country: "Malta" })];
  assert.equal(filtrarProgramas({ programas, termo: "", weeks: 4 }).resultados.length, 2);
  assert.equal(filtrarProgramas({ programas, termo: "", weeks: 4, country: "Malta" }).resultados.length, 1);
});

test("montarOrcamento: semanal (curso + acomodacao + matricula + seguro)", () => {
  const p = prog({ wfee: 340, appFee: 100, wmatFee: 0, insuranceWeekly: 14, accom: { homestay: 133, residence: 485 } });
  const o = montarOrcamento(p, { weeks: 4, accomOn: true, accomType: "homestay", insuranceOn: true });
  // curso 4x340=1360 + acom 4x133=532 + matricula 100 + seguro 4x14=56 = 2048
  assert.equal(o.curso, 1360);
  assert.equal(o.acomodacao, 532);
  assert.equal(o.matricula, 100);
  assert.equal(o.seguro, 56);
  assert.equal(o.totalMoeda, 2048);
  assert.equal(o.currency, "GBP");
  assert.ok(!o.linhas.find((l) => l.chave === "material")); // material 0 nao aparece
});

test("montarOrcamento: material POR SEMANA", () => {
  const p = prog({ wfee: 340, wmatFee: 20, appFee: 0, insuranceWeekly: 0, accom: null });
  const o = montarOrcamento(p, { weeks: 3, accomOn: false, accomType: "homestay", insuranceOn: false });
  assert.equal(o.material, 60); // 3 x 20
  assert.equal(o.totalMoeda, 1080); // 3x340 + 60
});

test("montarOrcamento: pacote fixo cobra o curso uma vez", () => {
  const p = prog({ fixedFee: true, wfee: 655, minWeeks: 4, maxWeeks: 4, appFee: 0, wmatFee: 0, insuranceWeekly: 0, accom: null });
  const o = montarOrcamento(p, { weeks: 4, accomOn: false, accomType: "homestay", insuranceOn: false });
  assert.equal(o.curso, 655); // nao 655x4
});

test("montarOrcamento: acomodacao desligada nao entra", () => {
  const p = prog({ accom: { homestay: 133, residence: 485 } });
  const o = montarOrcamento(p, { weeks: 4, accomOn: false, accomType: "homestay", insuranceOn: false });
  assert.equal(o.acomodacao, 0);
});

test("converterBRL arredonda pelo VET", () => {
  assert.equal(converterBRL(2048, 6.5), 13312);
  assert.equal(converterBRL(1000, 0), 0);
});

test("planoPix: entrada + N parcelas somam o total", () => {
  const plano = planoPix({ totalBRL: 10000, dataInicioISO: "2027-06-01", hojeISO: "2026-09-10" });
  assert.ok(plano.parcelas.length >= 2);
  const soma = plano.parcelas.reduce((s, p) => s + p.valor, 0);
  assert.equal(soma, 10000);
  assert.equal(plano.parcelas[0].rotulo, "Entrada");
  assert.ok(plano.parcelas[plano.parcelas.length - 1].rotulo.includes("final"));
});

test("planoPix: ultima parcela vence 30 dias antes do inicio", () => {
  const plano = planoPix({ totalBRL: 9000, dataInicioISO: "2027-06-30", hojeISO: "2026-09-10" });
  const ultima = plano.parcelas[plano.parcelas.length - 1];
  assert.equal(ultima.vencimento, "2027-05-31"); // 30 dias antes de 2027-06-30
});

test("planoPix: inicio muito proximo -> pagamento unico", () => {
  const plano = planoPix({ totalBRL: 5000, dataInicioISO: "2026-09-20", hojeISO: "2026-09-10" });
  assert.equal(plano.parcelas.length, 1);
  assert.ok(plano.parcelas[0].rotulo.includes("pagamento único"));
  assert.equal(plano.parcelas[0].valor, 5000);
});

test("planoPix: numero de parcelas editavel pelo lead", () => {
  const plano = planoPix({ totalBRL: 12000, dataInicioISO: "2027-12-01", hojeISO: "2026-09-10", numParcelasForcado: 6 });
  assert.equal(plano.parcelas.length, 6); // entrada + 5
  assert.equal(plano.parcelas.reduce((s, p) => s + p.valor, 0), 12000);
});

test("planoPix: forcar 1 parcela = pagamento unico", () => {
  const plano = planoPix({ totalBRL: 12000, dataInicioISO: "2027-12-01", hojeISO: "2026-09-10", numParcelasForcado: 1 });
  assert.equal(plano.parcelas.length, 1);
  assert.equal(plano.parcelas[0].valor, 12000);
});

test("calcularNTrimestre: escada da spec (hoje ago/2026, M=2)", () => {
  const casos: Array<[string, number]> = [
    ["2026-12-31", 3], ["2027-03-31", 6], ["2027-06-30", 9],
    ["2027-09-30", 12], ["2027-12-31", 15], ["2028-03-31", 18],
  ];
  for (const [fim, n] of casos) {
    assert.equal(calcularNTrimestre("2026-08-01", fim, 2), n, `fim ${fim}`);
  }
});

test("calcularNTrimestre: teto de 18 e piso de 1", () => {
  assert.equal(calcularNTrimestre("2026-08-01", "2030-12-31", 2), 18);
  assert.equal(calcularNTrimestre("2026-08-01", "2026-08-31", 2), 1);
});

test("trimestresDisponiveis: comeca no proximo trimestre, 6 itens", () => {
  const t = trimestresDisponiveis("2026-09-10", 6); // Q3/26 -> comeca Q4/26
  assert.equal(t.length, 6);
  assert.equal(t[0].label, "4º/26");
  assert.equal(t[0].fimISO, "2026-12-31");
  assert.equal(t[5].label, "1º/28");
});

test("simularParcelamento: parcela = (total-entrada)/N x VET", () => {
  // Card 1 Dublin: total 3290, entrada 160 -> financiado 3130; Q2/27 N=9; EUR 5.87
  const s = simularParcelamento({ totalMoeda: 3290, entradaMoeda: 160, vet: 5.87, n: 9 });
  assert.equal(s.financiadoMoeda, 3130);
  assert.equal(s.parcelaBRL, 2041); // 3130/9 * 5.87 = 2041.46 -> 2041 (spec ~2042, so arredondamento)
  assert.equal(s.entradaBRL, 939); // 160*5.87
});
