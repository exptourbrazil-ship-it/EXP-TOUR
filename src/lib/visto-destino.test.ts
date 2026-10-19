// Testes do card de visto (regra por pais, categoria e duracao).
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolverVisto, categoriaDoPrograma } from "./visto-destino.ts";

test("pais fora da tabela ou ausente: sem card", () => {
  assert.equal(resolverVisto({ pais: "JP" }), null);
  assert.equal(resolverVisto({ pais: null }), null);
});

test("Reino Unido: ETA ate 6 meses, curso de ingles 6-11 meses, Student Visa acima", () => {
  assert.equal(resolverVisto({ pais: "GB", inicio: "2027-03-01", fim: "2027-03-26" })?.situacao, "autorizacao");
  assert.match(resolverVisto({ pais: "gb", semanas: 12 })?.titulo ?? "", /^ETA/);
  assert.match(resolverVisto({ pais: "UK", semanas: 40 })?.titulo ?? "", /Short-term study visa/);
  assert.equal(resolverVisto({ pais: "GB", semanas: 60 })?.titulo, "Student Visa");
});

test("Canada: curso curto sem study permit; longo com study permit", () => {
  assert.match(resolverVisto({ pais: "CA", semanas: 12 })?.titulo ?? "", /Sem study permit/);
  assert.match(resolverVisto({ pais: "CA", semanas: 40 })?.titulo ?? "", /^Study Permit/);
});

test("Schengen: sem visto ate 90 dias, visto nacional acima", () => {
  assert.equal(resolverVisto({ pais: "MT", semanas: 8 })?.situacao, "isento");
  assert.match(resolverVisto({ pais: "MT", semanas: 20 })?.titulo ?? "", /D-Visa/);
  assert.match(resolverVisto({ pais: "ES", inicio: "2027-01-01", fim: "2027-06-30" })?.titulo ?? "", /Visado de estudios/);
  assert.match(resolverVisto({ pais: "DE", semanas: 20 })?.titulo ?? "", /Nationales Visum/);
});

test("Australia e Nova Zelandia: curto x longo", () => {
  assert.match(resolverVisto({ pais: "AU", semanas: 4 })?.titulo ?? "", /Visitor visa/);
  assert.match(resolverVisto({ pais: "AU", semanas: 20 })?.titulo ?? "", /subclass 500/);
  assert.match(resolverVisto({ pais: "NZ", semanas: 6 })?.titulo ?? "", /NZeTA/);
  assert.equal(resolverVisto({ pais: "NZ", semanas: 20 })?.titulo, "Fee Paying Student Visa");
});

test("EUA: F-1 sempre para estudo", () => {
  assert.equal(resolverVisto({ pais: "US", semanas: 2 })?.titulo, "Visto F-1 (estudante)");
});

test("sem datas nem semanas: caso conservador (duracao desconhecida)", () => {
  assert.match(resolverVisto({ pais: "GB" })?.titulo ?? "", /ETA/);
  assert.equal(resolverVisto({ pais: "IE" })?.situacao, "isento");
});

test("datas invertidas sao ignoradas e as semanas valem", () => {
  assert.equal(resolverVisto({ pais: "GB", inicio: "2027-05-01", fim: "2027-04-01", semanas: 60 })?.titulo, "Student Visa");
});

test("categoria do programa pelo nome", () => {
  assert.equal(categoriaDoPrograma("Internship - Marketing"), "estagio");
  assert.equal(categoriaDoPrograma("Estágio em Dublin"), "estagio");
  assert.equal(categoriaDoPrograma("Volunteering Program"), "voluntariado");
  assert.equal(categoriaDoPrograma("Au Pair USA"), "trabalho");
  assert.equal(categoriaDoPrograma("General English 20", "Inglês Geral"), "estudo");
});

test("estagio e voluntariado nunca caem em isento nem em visto de estudante", () => {
  for (const pais of ["IE", "MT", "ES", "GB", "US", "CA", "AU", "NZ", "DE", "FR", "AE"]) {
    for (const categoria of ["estagio", "voluntariado", "trabalho"] as const) {
      const v = resolverVisto({ categoria, pais, semanas: 4 });
      assert.ok(v, `${pais} ${categoria}`);
      assert.notEqual(v.situacao, "isento", `${pais} ${categoria}`);
      assert.ok(!/^(Student Visa|Visto F-1|Fee Paying)/.test(v.titulo), `${pais} ${categoria}: ${v.titulo}`);
      assert.equal(v.categoria, categoria);
    }
  }
});

test("regra nao confirmada diz que e a confirmar, em vez de afirmar um visto", () => {
  const v = resolverVisto({ categoria: "estagio", pais: "MT", semanas: 8 });
  assert.match(v?.titulo ?? "", /a confirmar/);
  assert.ok(v?.alertas.some((a) => /confirm/.test(a)));
});

test("fonte so aceita https", () => {
  const v = resolverVisto({ pais: "US", semanas: 12 });
  assert.match(v?.fonte ?? "", /^https:\/\//);
});
