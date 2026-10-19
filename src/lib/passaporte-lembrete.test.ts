// Testes do motor puro do lembrete de passaporte.
import { test } from "node:test";
import assert from "node:assert/strict";
import { conteudoSolicitacaoPassaporte, titularEhEstudante } from "./passaporte-lembrete.ts";

test("titularEhEstudante: vazio, igual (sem caixa) e diferente", () => {
  assert.equal(titularEhEstudante("José Luiz Kist", ""), true); // sem estudante -> titular é o estudante
  assert.equal(titularEhEstudante("Silvano Kroth", "silvano kroth"), true); // mesmo nome, caixa diferente
  assert.equal(titularEhEstudante("José Luiz Kist", "Gabriel Luiz Kist"), false);
});

test("conteúdo: estudante diferente do titular — cita o estudante", () => {
  const c = conteudoSolicitacaoPassaporte({ nome: "José Luiz Kist", estudante: "Gabriel Luiz Kist" });
  assert.equal(c.saudacao, "Olá, José!"); // 1º nome do titular
  assert.match(c.subject, /^Falta o passaporte de Gabriel Luiz Kist —/); // nome completo no assunto
  assert.match(c.paragrafo, /programa de Gabriel\b/); // 1º nome do estudante no corpo
  assert.match(c.paragrafo, /foto e os dados pessoais/);
  assert.equal(c.botaoLabel, "Enviar o passaporte");
});

test("conteúdo: titular é o próprio estudante — usa 'seu passaporte'", () => {
  const c = conteudoSolicitacaoPassaporte({ nome: "Silvano Kroth", estudante: "" });
  assert.equal(c.subject, "Falta o seu passaporte — envie pela Área do Cliente");
  assert.match(c.paragrafo, /imagem do seu passaporte/);
  assert.match(c.paragrafo, /seu programa/);

  // Estudante igual ao titular também cai no caminho "próprio".
  const c2 = conteudoSolicitacaoPassaporte({ nome: "Ana Paula Müller", estudante: "Ana Paula Müller" });
  assert.match(c2.subject, /seu passaporte/);
});

test("conteúdo: titular sem nome — saudação genérica, sem 'undefined'", () => {
  const c = conteudoSolicitacaoPassaporte({ nome: "", estudante: "Pedro Kroth" });
  assert.equal(c.saudacao, "Olá!");
  assert.doesNotMatch(c.paragrafo, /undefined/);
});
