import { test } from "node:test";
import assert from "node:assert/strict";
import { interpretarPeriodoSazonal, descreverIntervalo } from "./sazonalidade.ts";

test("periodo recorrente simples", () => {
  const r = interpretarPeriodoSazonal("14/jun a 23/ago");
  assert.deepEqual(r.intervalos, [{ from: { month: 6, day: 14 }, to: { month: 8, day: 23 } }]);
  assert.equal(r.motivo, undefined);
});

test("periodo com ano explicito", () => {
  const r = interpretarPeriodoSazonal("26/jun a 30/ago/2026");
  assert.deepEqual(r.intervalos, [{ from: { month: 6, day: 26 }, to: { month: 8, day: 30, year: 2026 } }]);
});

test("dois intervalos separados por 'e'", () => {
  const r = interpretarPeriodoSazonal("3/jan a 28/fev e 1/nov a 31/dez");
  assert.equal(r.intervalos.length, 2);
  assert.deepEqual(r.intervalos[1], { from: { month: 11, day: 1 }, to: { month: 12, day: 31 } });
});

test("dois intervalos com anos (cruzando o ano novo)", () => {
  const r = interpretarPeriodoSazonal("4/jan/2026 a 23/mai/2026 e 16/ago/2026 a 3/jan/2027");
  assert.equal(r.intervalos.length, 2);
  assert.deepEqual(r.intervalos[0].from, { month: 1, day: 4, year: 2026 });
  assert.deepEqual(r.intervalos[1].to, { month: 1, day: 3, year: 2027 });
});

test("frases que negam o periodo nao viram intervalo", () => {
  for (const t of [
    "não se aplica (reservas de 12+ semanas)",
    "não publicado",
    "sob consulta",
    "não há desconto de baixa temporada publicado",
    "fora de 26/jun a 30/ago/2026 (preço base)",
    "4/jan a 23/mai/2026 e 16/ago/2026 a 3/jan/2027 (preço base)",
  ]) {
    const r = interpretarPeriodoSazonal(t);
    assert.equal(r.intervalos.length, 0, t);
    assert.ok(r.motivo, `deveria explicar o motivo: ${t}`);
  }
});

test("excecao dentro do periodo nao vira dois periodos cobraveis", () => {
  const r = interpretarPeriodoSazonal("1/jun a 31/ago, exceto 10/jul a 20/jul");
  assert.equal(r.intervalos.length, 0);
  assert.ok(r.motivo);
});

test("periodo invertido e recusado (viraria quase o ano inteiro)", () => {
  const r = interpretarPeriodoSazonal("23/ago a 14/jun");
  assert.equal(r.intervalos.length, 0);
  assert.match(r.motivo ?? "", /invertido/);
  // Virada de ano curta continua valendo (15/dez a 10/jan).
  assert.equal(interpretarPeriodoSazonal("15/dez a 10/jan").intervalos.length, 1);
});

test("texto vazio e texto sem data", () => {
  assert.equal(interpretarPeriodoSazonal("").intervalos.length, 0);
  assert.equal(interpretarPeriodoSazonal(null).intervalos.length, 0);
  const r = interpretarPeriodoSazonal("durante o verão europeu");
  assert.equal(r.intervalos.length, 0);
  assert.match(r.motivo ?? "", /nenhuma data/);
});

test("data invalida recusa o texto inteiro", () => {
  assert.equal(interpretarPeriodoSazonal("31/fev a 10/mar").intervalos.length, 0);
  assert.equal(interpretarPeriodoSazonal("14/xxx a 23/ago").intervalos.length, 0);
});

test("numero impar de datas nao vira intervalo (evita par errado)", () => {
  const r = interpretarPeriodoSazonal("14/jun a 23/ago e 1/nov");
  assert.equal(r.intervalos.length, 0);
  assert.match(r.motivo ?? "", /ímpar/);
});

test("29/fev e aceito (ano bissexto e regra do motor)", () => {
  assert.equal(interpretarPeriodoSazonal("1/jan a 29/fev").intervalos.length, 1);
});

test("meses em ingles (price list da escola)", () => {
  const r = interpretarPeriodoSazonal("14/jun a 23/aug");
  assert.deepEqual(r.intervalos[0].to, { month: 8, day: 23 });
});

test("descreverIntervalo devolve o rotulo da linha", () => {
  assert.equal(descreverIntervalo({ from: { month: 6, day: 14 }, to: { month: 8, day: 23 } }), "14/jun a 23/ago");
  assert.equal(descreverIntervalo({ from: { month: 6, day: 26 }, to: { month: 8, day: 30, year: 2026 } }), "26/jun a 30/ago/2026");
});
