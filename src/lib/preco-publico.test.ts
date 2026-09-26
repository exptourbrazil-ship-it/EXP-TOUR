// Testes do nucleo puro das rotas publicas de preco (Chat da Forio).
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolverDestino, montarOpcoes } from "./preco-publico.ts";
import type { ProgramaOrcavel } from "./orcamento.ts";

function prog(over: Partial<ProgramaOrcavel> & { id: string }): ProgramaOrcavel {
  return {
    slug: over.id, courseName: "General English", courseType: "english-for-specific-purposes",
    city: "London", country: "UK", school: "Escola " + over.id, currency: "GBP",
    minWeeks: 1, maxWeeks: 12, fixedFee: false, wfee: 300, appFee: 100, wmatFee: 10,
    accom: { residence: 400, homestay: 200 }, insuranceWeekly: 10, ...over,
  };
}

const catalogo = [
  prog({ id: "a", wfee: 300 }),
  prog({ id: "b", wfee: 400, courseName: "Executive English", courseType: "english-for-professionals" }),
  prog({ id: "c", wfee: 250, city: "St. Paul's Bay", country: "Malta", currency: "EUR" }),
  prog({ id: "d", wfee: 500, city: "Toronto", country: "Canada", currency: "CAD", minWeeks: 8 }),
  prog({ id: "e", wfee: 350, school: "Escola a" }), // mesma escola que "a"
];
const cambio = { GBP: 7, EUR: 6, CAD: 4 };

test("resolverDestino: cidade em portugues, pais em portugues, e nao encontrado", () => {
  assert.deepEqual(resolverDestino("Londres", catalogo), { nivel: "cidade", destino: "London", pais: "UK" });
  assert.deepEqual(resolverDestino("london", catalogo), { nivel: "cidade", destino: "London", pais: "UK" });
  assert.deepEqual(resolverDestino("St Paul's Bay", catalogo), { nivel: "cidade", destino: "St. Paul's Bay", pais: "Malta" });
  assert.deepEqual(resolverDestino("Inglaterra", catalogo), { nivel: "pais", destino: "UK" });
  assert.deepEqual(resolverDestino("Canadá", catalogo), { nivel: "pais", destino: "Canada" });
  assert.deepEqual(resolverDestino("malta", catalogo), { nivel: "pais", destino: "Malta" });
  assert.equal(resolverDestino("Paris", catalogo), null);
  assert.equal(resolverDestino("   ", catalogo), null);
});

test("montarOpcoes: ate 3 opcoes, uma por escola, mais barata primeiro em BRL", () => {
  const r = montarOpcoes({ semanas: 4, acomodacao: "homestay", seguro: true }, catalogo, cambio, "2026-09-26");
  assert.equal(r.opcoes.length, 3);
  // c (Malta): 1000+800+100+40+40 = 1980 EUR -> 11880 BRL
  // a (UK):    1200+800+100+40+40 = 2180 GBP -> 15260
  // e (UK, mesma escola de a): 2380 GBP -> 16660 (deduplicada por escola)
  // b (UK):    1600+800+100+40+40 = 2580 GBP -> 18060
  assert.deepEqual(r.opcoes.map((o) => o.programaId), ["c", "a", "b"]);
  assert.equal(r.opcoes[0].totalBrl, 11880);
  assert.equal(r.opcoes[1].totalMoeda, 2180);
  assert.equal(r.excluidas.fora_da_duracao, 1); // d exige 8 semanas
  assert.equal(r.excluidas.limite, 1); // e, mesma escola
  assert.equal(r.dataCambio, "2026-09-26");
  assert.equal(r.destino, null);
});

test("montarOpcoes: destino filtra por cidade e conta exclusoes", () => {
  const r = montarOpcoes({ destino: "Londres", semanas: 4, acomodacao: "none", seguro: false }, catalogo, cambio, "d");
  assert.ok(r.opcoes.every((o) => o.cidade === "London"));
  assert.equal(r.excluidas.fora_do_destino, 2); // c e d
  // sem acomodacao nem seguro: a = 1200+100+40 = 1340
  assert.equal(r.opcoes[0].totalMoeda, 1340);
  assert.deepEqual(r.opcoes[0].linhas.map((l) => l.chave), ["curso", "matricula", "material"]);
});

test("montarOpcoes: teto em BRL exclui e sem cambio conta como sem_cambio", () => {
  const r = montarOpcoes({ semanas: 4, acomodacao: "homestay", seguro: true, orcamentoMaxBrl: 12000 }, catalogo, { EUR: 6 }, "d");
  assert.deepEqual(r.opcoes.map((o) => o.programaId), ["c"]);
  assert.equal(r.excluidas.sem_cambio, 3); // a, b, e (GBP sem cambio)
});

test("montarOpcoes: termo restringe; limite respeita o maximo de 3", () => {
  const r = montarOpcoes({ semanas: 4, acomodacao: "homestay", seguro: true, termo: "executive", limite: 10 }, catalogo, cambio, "d");
  assert.deepEqual(r.opcoes.map((o) => o.programaId), ["b"]);
  const r2 = montarOpcoes({ semanas: 4, acomodacao: "homestay", seguro: true, limite: 1 }, catalogo, cambio, "d");
  assert.equal(r2.opcoes.length, 1);
});

test("montarOpcoes: acomodacao pedida que o campus nao tem -> opcao sai sem a linha", () => {
  const soRes = [prog({ id: "x", accom: { residence: 400 } })];
  const r = montarOpcoes({ semanas: 4, acomodacao: "homestay", seguro: false }, soRes, cambio, "d");
  assert.equal(r.opcoes.length, 1);
  assert.ok(!r.opcoes[0].linhas.some((l) => l.chave === "acomodacao"));
});

test("montarOpcoes: online e 1:1 ficam de fora por padrao; entram se o termo pedir", () => {
  const cat = [
    prog({ id: "on", courseName: "1:1 online training", wfee: 100 }),
    prog({ id: "one", courseName: "One-to-one English", wfee: 120 }),
    prog({ id: "grp", courseName: "General English", wfee: 300 }),
  ];
  const r = montarOpcoes({ semanas: 4, acomodacao: "homestay", seguro: true }, cat, cambio, "d");
  assert.deepEqual(r.opcoes.map((o) => o.programaId), ["grp"]);
  assert.equal(r.excluidas.formato_nao_presencial, 2);
  const r2 = montarOpcoes({ semanas: 4, acomodacao: "homestay", seguro: true, termo: "online" }, cat, cambio, "d");
  assert.deepEqual(r2.opcoes.map((o) => o.programaId), ["on"]);
});

test("montarOpcoes: com acomodacao pedida, programa com acomodacao vem antes do mais barato sem", () => {
  const cat = [
    prog({ id: "sem", accom: null, wfee: 100, school: "S1" }),
    prog({ id: "com", accom: { homestay: 200 }, wfee: 300, school: "S2" }),
  ];
  const r = montarOpcoes({ semanas: 4, acomodacao: "homestay", seguro: true }, cat, cambio, "d");
  assert.deepEqual(r.opcoes.map((o) => o.programaId), ["com", "sem"]);
  const r2 = montarOpcoes({ semanas: 4, acomodacao: "none", seguro: true }, cat, cambio, "d");
  assert.deepEqual(r2.opcoes.map((o) => o.programaId), ["sem", "com"]);
});
