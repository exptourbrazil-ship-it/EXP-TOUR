import { test } from "node:test";
import assert from "node:assert/strict";
import { montarAnexoIIISeed, prazoD30 } from "./anexo-iii-seed.ts";

const REF = "2026-12";

test("A1 um item por linha com valor > 0, ordem sequencial", () => {
  const seed = montarAnexoIIISeed({
    referencia: REF,
    dataInicioContrato: "2027-03-01",
    itens: [
      { grupo: "program", nome: "Inglês Geral 24s", valor: 12000, moeda: "CAD", startDate: "2027-03-01", fornecedor: "ILAC Vancouver" },
      { grupo: "accommodation", nome: "Homestay", valor: 6000, moeda: "CAD", startDate: "2027-03-01", fornecedor: "ILAC Vancouver" },
      { grupo: "insurance", nome: "Seguro saúde", valor: 800, moeda: "CAD", startDate: null, fornecedor: "Guard.me" },
    ],
  });
  assert.equal(seed.length, 3);
  assert.deepEqual(seed.map((s) => s.ordem), [0, 1, 2]);
  assert.equal(seed[0].fornecedor, "ILAC Vancouver");
  assert.equal(seed[0].natureza, "Inglês Geral 24s");
  assert.equal(seed[0].valor, 12000);
  assert.equal(seed[0].moeda, "CAD");
  assert.match(seed[0].prazo!, /30 dias antes/);
  assert.equal(seed[0].fonte, "Cotacao 2026-12");
});

test("A2 linha com valor <= 0 é ignorada (item gratuito)", () => {
  const seed = montarAnexoIIISeed({
    referencia: REF,
    dataInicioContrato: null,
    itens: [
      { grupo: "program", nome: "Curso", valor: 5000, moeda: "USD", startDate: null, fornecedor: "Kaplan" },
      { grupo: "other", nome: "Semana grátis", valor: 0, moeda: "USD", startDate: null, fornecedor: "Kaplan" },
    ],
  });
  assert.equal(seed.length, 1);
  assert.equal(seed[0].natureza, "Curso");
});

test("A3 fornecedor/natureza têm fallback", () => {
  const seed = montarAnexoIIISeed({
    referencia: REF,
    dataInicioContrato: null,
    itens: [{ grupo: "accommodation", nome: null, valor: 1000, moeda: "eur", startDate: null, fornecedor: null }],
  });
  assert.equal(seed[0].fornecedor, "Fornecedor a confirmar");
  assert.equal(seed[0].natureza, "Acomodacao"); // rótulo do grupo
  assert.equal(seed[0].moeda, "EUR"); // uppercase
});

test("A4 prazo usa a data da linha; senão a do contrato", () => {
  const comData = montarAnexoIIISeed({
    referencia: REF,
    dataInicioContrato: "2027-06-01",
    itens: [{ grupo: "program", nome: "X", valor: 100, moeda: "GBP", startDate: "2027-04-15", fornecedor: "A" }],
  });
  // D-30 de 2027-04-15 = 2027-03-16
  assert.match(comData[0].prazo!, /16\/03\/2027/);

  const semData = montarAnexoIIISeed({
    referencia: REF,
    dataInicioContrato: "2027-06-01",
    itens: [{ grupo: "program", nome: "X", valor: 100, moeda: "GBP", startDate: null, fornecedor: "A" }],
  });
  // cai no fallback do contrato: D-30 de 2027-06-01 = 2027-05-02
  assert.match(semData[0].prazo!, /02\/05\/2027/);
});

test("A5 prazoD30 sem data usa texto genérico", () => {
  assert.equal(prazoD30(null), "30 dias antes do inicio do programa");
  assert.match(prazoD30("2027-01-31"), /01\/01\/2027/); // D-30 de 31/01 = 01/01
});

test("A6 lista vazia -> seed vazio", () => {
  assert.deepEqual(montarAnexoIIISeed({ referencia: REF, dataInicioContrato: null, itens: [] }), []);
});

test("A7 política pré-preenchida do acordo -> politica_cancelamento + fonte cita o acordo", () => {
  const seed = montarAnexoIIISeed({
    referencia: REF,
    dataInicioContrato: null,
    itens: [
      { grupo: "program", nome: "Curso", valor: 5000, moeda: "CAD", startDate: null, fornecedor: "ILAC", politicaPagamento: "Depósito não reembolsável; saldo 30 dias antes." },
      { grupo: "insurance", nome: "Seguro", valor: 500, moeda: "CAD", startDate: null, fornecedor: "Guard.me", politicaPagamento: null },
    ],
  });
  assert.equal(seed[0].politica_cancelamento, "Depósito não reembolsável; saldo 30 dias antes.");
  assert.match(seed[0].fonte!, /acordo do fornecedor/);
  // sem acordo -> política null e fonte sem menção ao acordo
  assert.equal(seed[1].politica_cancelamento, null);
  assert.equal(seed[1].fonte, "Cotacao 2026-12");
});
