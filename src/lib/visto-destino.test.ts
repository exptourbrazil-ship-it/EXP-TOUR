// Testes do card de visto (regra por pais, categoria e duracao).
// Escopo: so paises/programas CADASTRADOS no catalogo (CA, GB, IE, MT, NZ, US).
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolverVisto, categoriaDoPrograma } from "./visto-destino.ts";

test("pais sem programa cadastrado ou ausente: sem card", () => {
  for (const p of ["AU", "ES", "FR", "DE", "AE", "JP"]) assert.equal(resolverVisto({ pais: p, semanas: 8 }), null, p);
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

test("Malta: sem visto ate 90 dias, D-Visa acima", () => {
  assert.equal(resolverVisto({ pais: "MT", semanas: 8 })?.situacao, "isento");
  assert.match(resolverVisto({ pais: "MT", semanas: 20 })?.titulo ?? "", /D-Visa/);
});

test("Irlanda e Nova Zelandia: curto x longo", () => {
  assert.equal(resolverVisto({ pais: "IE", semanas: 4 })?.situacao, "isento");
  assert.match(resolverVisto({ pais: "IE", semanas: 30 })?.titulo ?? "", /IRP/);
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
  assert.equal(categoriaDoPrograma("London Internship"), "estagio");
  assert.equal(categoriaDoPrograma("Business English In Action (Internship)"), "estagio");
  assert.equal(categoriaDoPrograma("Volunteering in Eastbourne"), "voluntariado");
  assert.equal(categoriaDoPrograma("General English 20", "Inglês Geral"), "estudo");
});

test("programas cadastrados de estagio e voluntariado: tipo proprio, nunca isento nem visto de estudante", () => {
  const casos: Array<[string, "estagio" | "voluntariado"]> = [["US", "estagio"], ["GB", "estagio"], ["GB", "voluntariado"], ["IE", "estagio"]];
  for (const [pais, categoria] of casos) {
    const v = resolverVisto({ categoria, pais, semanas: 8 });
    assert.ok(v, `${pais} ${categoria}`);
    assert.notEqual(v.situacao, "isento", `${pais} ${categoria}`);
    assert.ok(!/^(Student Visa|Visto F-1 \(estudante\)|Fee Paying)/.test(v.titulo), `${pais} ${categoria}: ${v.titulo}`);
    assert.equal(v.categoria, categoria);
  }
  assert.match(resolverVisto({ categoria: "estagio", pais: "US", semanas: 8 })?.titulo ?? "", /F-1/);
  assert.ok(resolverVisto({ categoria: "estagio", pais: "US", semanas: 8 })?.alertas.some((a) => /J-1/.test(a)));
  assert.match(resolverVisto({ categoria: "estagio", pais: "GB", semanas: 8 })?.titulo ?? "", /Government Authorised Exchange/);
});

test("categoria sem regra cadastrada num pais registrado diz que e a confirmar", () => {
  const v = resolverVisto({ categoria: "estagio", pais: "MT", semanas: 8 });
  assert.match(v?.titulo ?? "", /a confirmar/);
  assert.ok(v?.alertas.some((a) => /confirm/.test(a)));
});

test("fonte so aceita https", () => {
  assert.match(resolverVisto({ pais: "US", semanas: 12 })?.fonte ?? "", /^https:\/\//);
});

test("voluntariado no Reino Unido: ETA ate 30 dias; acima disso, a confirmar", () => {
  assert.equal(resolverVisto({ categoria: "voluntariado", pais: "GB", semanas: 4 })?.situacao, "autorizacao");
  const longo = resolverVisto({ categoria: "voluntariado", pais: "GB", semanas: 6 });
  assert.equal(longo?.situacao, "visto");
  assert.match(longo?.titulo ?? "", /Charity Worker/);
  assert.ok(longo?.alertas.some((a) => /Twin/.test(a)));
  assert.equal(resolverVisto({ categoria: "voluntariado", pais: "GB", inicio: "2027-03-01", fim: "2027-03-30" })?.situacao, "autorizacao");
});

test("estagio Twin Londres: custo do certificado BUNAC aparece", () => {
  const v = resolverVisto({ categoria: "estagio", pais: "GB", semanas: 12 });
  assert.ok(v?.detalhes.some((d) => /BUNAC: £ 2\.500/.test(d)));
});
