// Testes do nucleo puro da faixa de preco derivada (Diagnostico Forio, item 0.5a).
import { test } from "node:test";
import assert from "node:assert/strict";
import { percentil, calcularFaixas, bucketMaisProximo, aceitaSemanas, SEMANAS_FAIXA } from "./faixa-preco.ts";
import type { ProgramaOrcavel } from "./orcamento.ts";

function prog(over: Partial<ProgramaOrcavel> & { id: string }): ProgramaOrcavel {
  return {
    slug: over.id, courseName: "General English", courseType: "english-for-specific-purposes",
    city: "London", country: "UK", school: "Escola " + over.id, currency: "GBP",
    minWeeks: 1, maxWeeks: 12, fixedFee: false, wfee: 300, appFee: 100, wmatFee: 10,
    accom: { residence: 400, homestay: 200 }, insuranceWeekly: 10, ...over,
  };
}

test("percentil: interpolacao linear e casos de borda", () => {
  assert.equal(percentil([], 0.5), 0);
  assert.equal(percentil([7], 0.25), 7);
  assert.equal(percentil([1, 2, 3, 4], 0.5), 2.5);
  assert.equal(percentil([10, 20, 30, 40, 50], 0.25), 20);
  assert.equal(percentil([50, 10, 40, 20, 30], 0.75), 40); // nao depende da ordem
});

test("aceitaSemanas: faixa aberta vs pacote fixo", () => {
  assert.equal(aceitaSemanas(prog({ id: "a", minWeeks: 2, maxWeeks: 8 }), 4), true);
  assert.equal(aceitaSemanas(prog({ id: "a", minWeeks: 2, maxWeeks: 8 }), 12), false);
  const fixo = prog({ id: "f", minWeeks: 4, maxWeeks: 4, fixedFee: true, wfee: 1200 });
  assert.equal(aceitaSemanas(fixo, 4), true);
  assert.equal(aceitaSemanas(fixo, 2), false);
});

test("calcularFaixas: agrega por pais e por cidade, com BRL pelo cambio", () => {
  const programas = [
    prog({ id: "a", wfee: 300 }), // 4 sem: 1200 + 800 + 100 + 40 + 40 = 2180
    prog({ id: "b", wfee: 400 }), // 1600 + 800 + 100 + 40 + 40 = 2580
    prog({ id: "c", wfee: 500, city: "Oxford" }), // 2000 + 800 + 100 + 40 + 40 = 2980
  ];
  const faixas = calcularFaixas(programas, { GBP: 7 }, [4]);
  const uk = faixas.find((f) => f.nivel === "pais" && f.destino === "UK")!;
  assert.equal(uk.amostra, 3);
  assert.equal(uk.moeda, "GBP");
  assert.equal(uk.mediana, 2580);
  assert.equal(uk.p25, 2380);
  assert.equal(uk.p75, 2780);
  assert.equal(uk.medianaBrl, 2580 * 7);
  assert.deepEqual(uk.inclui, ["curso", "acomodacao", "matricula", "material", "seguro"]);

  const londres = faixas.find((f) => f.nivel === "cidade" && f.destino === "London")!;
  assert.equal(londres.amostra, 2);
  assert.equal(londres.pais, "UK");
  assert.equal(londres.mediana, (2180 + 2580) / 2);

  const oxford = faixas.find((f) => f.nivel === "cidade" && f.destino === "Oxford")!;
  assert.equal(oxford.amostra, 1);
  assert.equal(oxford.p25, 2980);
});

test("calcularFaixas: sem cambio -> BRL nulo; homestay preferido; sem acomodacao nao entra em 'inclui'", () => {
  const programas = [
    prog({ id: "a", accom: null, wmatFee: 0, insuranceWeekly: 0 }), // so curso + matricula
    prog({ id: "b", accom: { residence: 400 } }), // residencia quando nao ha homestay
  ];
  const faixas = calcularFaixas(programas, {}, [4]);
  const uk = faixas.find((f) => f.nivel === "pais")!;
  assert.equal(uk.medianaBrl, null);
  // a: 1200+100 = 1300; b: 1200+1600+100+40+40 = 2980. "inclui" exige metade da amostra: curso e matricula em ambos; acomodacao/material/seguro em 1 de 2 (= metade) tambem entram.
  assert.deepEqual(uk.inclui, ["curso", "acomodacao", "matricula", "material", "seguro"]);
  assert.equal(uk.p25, 1720);
});

test("calcularFaixas: programa que nao aceita o bucket fica de fora; bucket sem amostra nao gera linha", () => {
  const programas = [prog({ id: "a", minWeeks: 8, maxWeeks: 12 })];
  const faixas = calcularFaixas(programas, { GBP: 7 });
  assert.deepEqual(faixas.map((f) => f.semanas).sort((x, y) => x - y), [8, 8, 12, 12]);
});

test("calcularFaixas: destino com moedas misturadas usa a dominante e nunca soma", () => {
  const programas = [
    prog({ id: "a", currency: "GBP", wfee: 300 }),
    prog({ id: "b", currency: "GBP", wfee: 300 }),
    prog({ id: "c", currency: "USD", wfee: 9999 }),
  ];
  const uk = calcularFaixas(programas, { GBP: 7, USD: 5 }, [4]).find((f) => f.nivel === "pais")!;
  assert.equal(uk.moeda, "GBP");
  assert.equal(uk.amostra, 2);
});

test("bucketMaisProximo: aproxima para o bucket publicado, empate para baixo", () => {
  assert.deepEqual([...SEMANAS_FAIXA], [2, 4, 8, 12]);
  assert.equal(bucketMaisProximo(1), 2);
  assert.equal(bucketMaisProximo(3), 2); // empate 2/4 -> menor
  assert.equal(bucketMaisProximo(5), 4);
  assert.equal(bucketMaisProximo(6), 4); // empate 4/8 -> menor
  assert.equal(bucketMaisProximo(11), 12);
  assert.equal(bucketMaisProximo(40), 12);
  assert.equal(bucketMaisProximo(0), 2);
});
