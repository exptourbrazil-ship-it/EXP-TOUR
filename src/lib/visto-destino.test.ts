// Testes do card de visto (regra por pais e duracao).
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolverVisto, categoriaDoPrograma } from "./visto-destino.ts";

test("pais fora da tabela ou ausente: sem card", () => {
  assert.equal(resolverVisto({ pais: "JP" }), null);
  assert.equal(resolverVisto({ pais: null }), null);
});

test("Reino Unido: ETA ate 6 meses, Student Visa acima", () => {
  assert.equal(resolverVisto({ pais: "GB", inicio: "2027-03-01", fim: "2027-03-26" })?.situacao, "autorizacao");
  assert.equal(resolverVisto({ pais: "gb", semanas: 12 })?.titulo, "ETA (autorização eletrônica)");
  assert.equal(resolverVisto({ pais: "UK", semanas: 40 })?.titulo, "Student Visa");
});

test("Schengen: isento ate 90 dias, visto D acima", () => {
  assert.equal(resolverVisto({ pais: "MT", semanas: 8 })?.situacao, "isento");
  assert.equal(resolverVisto({ pais: "MT", semanas: 20 })?.situacao, "visto");
  assert.equal(resolverVisto({ pais: "ES", inicio: "2027-01-01", fim: "2027-06-30" })?.titulo, "Visto Nacional Tipo D");
});

test("destinos com visto sempre: EUA, Canada, Australia, Nova Zelandia", () => {
  for (const p of ["US", "CA", "AU", "NZ"]) assert.equal(resolverVisto({ pais: p, semanas: 2 })?.situacao, "visto");
  assert.equal(resolverVisto({ pais: "AU", semanas: 2 })?.titulo, "Student Visa (subclass 500)");
});

test("sem datas nem semanas: cai no caso conservador (duracao desconhecida)", () => {
  assert.equal(resolverVisto({ pais: "GB" })?.titulo, "ETA ou Student Visa (conforme a duração)");
  assert.equal(resolverVisto({ pais: "IE" })?.situacao, "isento");
});

test("datas invertidas sao ignoradas e as semanas valem", () => {
  assert.equal(resolverVisto({ pais: "GB", inicio: "2027-05-01", fim: "2027-04-01", semanas: 40 })?.titulo, "Student Visa");
});

test("categoria do programa pelo nome", () => {
  assert.equal(categoriaDoPrograma("Internship - Marketing"), "estagio");
  assert.equal(categoriaDoPrograma("Estágio em Dublin"), "estagio");
  assert.equal(categoriaDoPrograma("Volunteering Program"), "voluntariado");
  assert.equal(categoriaDoPrograma("Au Pair USA"), "trabalho");
  assert.equal(categoriaDoPrograma("General English 20", "Inglês Geral"), "estudo");
});

test("estagio e voluntariado nunca caem em isento nem em visto de estudante", () => {
  for (const pais of ["IE", "MT", "ES", "GB", "US", "AU", "JP-"]) {
    for (const categoria of ["estagio", "voluntariado"] as const) {
      const v = resolverVisto({ categoria, pais, semanas: 4 });
      if (!v) continue;
      assert.equal(v.situacao, "visto");
      assert.ok(!/Student Visa|F-1/.test(v.titulo), `${pais} ${categoria}: ${v.titulo}`);
      assert.ok(v.alertas.length > 0);
    }
  }
  assert.equal(resolverVisto({ categoria: "estagio", pais: "IE", semanas: 4 })?.categoria, "estagio");
});
