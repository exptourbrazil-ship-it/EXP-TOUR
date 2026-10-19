// Testes do motor puro da conclusão automática na data de término.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  adicionarDiasISO,
  elegivelParaConclusao,
  conteudoPedidoCertificado,
  conteudoAvisoFimAluno,
  avisoFimJanelaDias,
} from "./conclusao-programa.ts";

function cand(over: Partial<{ dataFimISO: string | null; estado: string | null; canceladoEm: string | null }> = {}) {
  // Respeita `null` explícito (não usa ?? — que colapsaria null no default).
  return {
    dataFimISO: "dataFimISO" in over ? (over.dataFimISO ?? null) : "2026-06-01",
    estado: "estado" in over ? (over.estado ?? null) : "em_programa",
    canceladoEm: over.canceladoEm ?? null,
  };
}

test("adicionarDiasISO soma dias em UTC", () => {
  assert.equal(adicionarDiasISO("2026-06-01", 3), "2026-06-04");
  assert.equal(adicionarDiasISO("2026-06-30", 1), "2026-07-01");
  assert.equal(adicionarDiasISO("2026-02-28", 1), "2026-03-01"); // 2026 não bissexto
  assert.equal(adicionarDiasISO("lixo", 3), null);
});

test("elegível: término + folga já passou -> true", () => {
  // data_fim 2026-06-01 + 3 = 2026-06-04 <= hoje 2026-06-10
  assert.equal(elegivelParaConclusao(cand(), "2026-06-10", 3), true);
});

test("não elegível: ainda dentro da folga", () => {
  // 2026-06-01 + 3 = 2026-06-04 > hoje 2026-06-02
  assert.equal(elegivelParaConclusao(cand(), "2026-06-02", 3), false);
});

test("elegível na borda (limite == hoje)", () => {
  assert.equal(elegivelParaConclusao(cand(), "2026-06-04", 3), true);
});

test("não elegível: sem data de término", () => {
  assert.equal(elegivelParaConclusao(cand({ dataFimISO: null }), "2026-12-01", 3), false);
});

test("não elegível: cancelado", () => {
  assert.equal(elegivelParaConclusao(cand({ canceladoEm: "2026-05-01" }), "2026-12-01", 3), false);
});

test("não elegível: já concluído / terminal", () => {
  assert.equal(elegivelParaConclusao(cand({ estado: "concluido" }), "2026-12-01", 3), false);
  assert.equal(elegivelParaConclusao(cand({ estado: "cancelado" }), "2026-12-01", 3), false);
  assert.equal(elegivelParaConclusao(cand({ estado: "proposta_expirada" }), "2026-12-01", 3), false);
});

test("não elegível: estado nulo ou desconhecido (não inventa execução)", () => {
  assert.equal(elegivelParaConclusao(cand({ estado: null }), "2026-12-01", 3), false);
  assert.equal(elegivelParaConclusao(cand({ estado: "lixo" }), "2026-12-01", 3), false);
});

test("não elegível: antes da fase de execução (proposta/matrícula/visto)", () => {
  // data vencida, mas o programa nunca entrou em execução -> não conclui.
  assert.equal(elegivelParaConclusao(cand({ estado: "proposta_enviada" }), "2026-12-01", 3), false);
  assert.equal(elegivelParaConclusao(cand({ estado: "matricula" }), "2026-12-01", 3), false);
  assert.equal(elegivelParaConclusao(cand({ estado: "visto" }), "2026-12-01", 3), false);
  assert.equal(elegivelParaConclusao(cand({ estado: "pre_embarque" }), "2026-12-01", 3), false);
});

test("elegível: em execução (em_programa e retorno) com data vencida", () => {
  assert.equal(elegivelParaConclusao(cand({ estado: "em_programa" }), "2026-12-01", 3), true);
  assert.equal(elegivelParaConclusao(cand({ estado: "retorno" }), "2026-12-01", 3), true);
});

test("folga 0: conclui no próprio dia do término", () => {
  assert.equal(elegivelParaConclusao(cand(), "2026-06-01", 0), true);
});

test("conteúdo do pedido: pt e en, sem vazar além do corpo", () => {
  const pt = conteudoPedidoCertificado("pt", { estudante: "Gabriel", programa: "General English", dataFimBR: "01/06/2026" });
  assert.match(pt.subject, /Gabriel/);
  assert.match(pt.contexto, /certificado/i);
  assert.match(pt.contexto, /relat[óo]rio/i);
  assert.equal(pt.botaoLabel, "Enviar documentos");

  const en = conteudoPedidoCertificado("en", { estudante: "Gabriel", programa: "", dataFimBR: "06/01/2026" });
  assert.match(en.contexto, /certificate/i);
  assert.match(en.contexto, /report/i);
  assert.equal(en.botaoLabel, "Upload documents");
});

test("aviso de fim ao aluno: PT, 1º nome, programa e convite ao /retorno", () => {
  const c = conteudoAvisoFimAluno({ nome: "Monik Alves Ramos", programa: "General English" });
  assert.match(c.subject, /intercâmbio/i);
  assert.equal(c.titulo, "Olá, Monik!"); // só o primeiro nome
  assert.match(c.paragrafo, /General English/);
  assert.match(c.paragrafo, /Retorno/);
  assert.match(c.paragrafo, /Google/);
  assert.equal(c.botaoLabel, "Acessar minha Área");

  // Sem nome e sem programa: saudação genérica, sem "undefined".
  const s = conteudoAvisoFimAluno({ nome: "", programa: "" });
  assert.equal(s.titulo, "Olá!");
  assert.doesNotMatch(s.paragrafo, /undefined/);
  assert.match(s.paragrafo, /Seu programa chegou ao fim/);
});

test("avisoFimJanelaDias: default 3; respeita env válido; ignora inválido", () => {
  const original = process.env.AVISO_FIM_JANELA_DIAS;
  delete process.env.AVISO_FIM_JANELA_DIAS;
  assert.equal(avisoFimJanelaDias(), 3);
  process.env.AVISO_FIM_JANELA_DIAS = "7";
  assert.equal(avisoFimJanelaDias(), 7);
  process.env.AVISO_FIM_JANELA_DIAS = "-2";
  assert.equal(avisoFimJanelaDias(), 3); // negativo -> default
  process.env.AVISO_FIM_JANELA_DIAS = "abc";
  assert.equal(avisoFimJanelaDias(), 3); // inválido -> default
  if (original === undefined) delete process.env.AVISO_FIM_JANELA_DIAS;
  else process.env.AVISO_FIM_JANELA_DIAS = original;
});
