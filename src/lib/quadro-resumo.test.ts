import { test } from "node:test";
import assert from "node:assert/strict";
import {
  montarQuadroResumo,
  serializarQuadroResumo,
  mascararCpf,
  mascararTelefone,
  QUADRO_RESUMO_SCHEMA_VERSAO,
  type QuadroResumoInput,
} from "./quadro-resumo.ts";

function base(): QuadroResumoInput {
  return {
    contratante: { nome: "  Maria Silva ", cpf: "123.456.789-00", email: "Maria@Exemplo.COM", telefone: "(11) 98765-4321" },
    participante: { nome: " João Silva ", paisDestino: "canada" },
    programa: { nome: " Inglês Geral ", fornecedor: "ILAC", referencia: "COT-2026-001", opcaoIndice: 0, dataInicio: "2026-10-01" },
    valores: { moeda: "CAD", total: 10000, entrada: 2000 },
    parcelas: [
      { numero: 0, descricao: "Entrada", valor: 2000, vencimento: "2026-09-05", is_entrada: true },
      { numero: 1, descricao: "Parcela 1", valor: 4000, vencimento: "2026-09-30" },
      { numero: 2, valor: 4000, vencimento: "2026-10-30" },
    ],
    itens: [
      { grupo: "program", nome: "Inglês Geral", valor: 8000, moeda: "CAD", startDate: "2026-10-01", fornecedor: "ILAC" },
      { grupo: "insurance", nome: "Seguro", valor: 2000, moeda: "CAD", startDate: null, fornecedor: null },
    ],
    termo: { versao: "v3", hash: "abc123" },
    geradoEm: "2026-08-30T12:00:00.000Z",
  };
}

// Q1 — estrutura e normalizacao (trim, lowercase do email, schema_versao).
test("Q1 monta estrutura com normalizacao", () => {
  const q = montarQuadroResumo(base());
  assert.equal(q.schema_versao, QUADRO_RESUMO_SCHEMA_VERSAO);
  assert.equal(q.contratante.nome, "Maria Silva");
  assert.equal(q.contratante.email, "maria@exemplo.com");
  assert.equal(q.participante.nome, "João Silva");
  assert.equal(q.programa.nome, "Inglês Geral");
});

// Q2 — CPF e telefone mascarados; nunca gravam os digitos completos.
test("Q2 mascara CPF e telefone", () => {
  const q = montarQuadroResumo(base());
  assert.equal(q.contratante.cpf_mascarado, "123.***.***-00");
  assert.equal(q.contratante.telefone_mascarado, "••••4321");
  const s = serializarQuadroResumo(q);
  assert.ok(!s.includes("456.789"), "nao pode conter o miolo do CPF");
  assert.ok(!s.includes("98765"), "nao pode conter o prefixo do telefone");
});

// Q3 — opcao vira 1-based; saldo = total - entrada.
test("Q3 opcao 1-based e saldo", () => {
  const q = montarQuadroResumo(base());
  assert.equal(q.programa.opcao_numero, 1);
  assert.equal(q.valores.total, 10000);
  assert.equal(q.valores.entrada, 2000);
  assert.equal(q.valores.saldo, 8000);
});

// Q4 — regime de pagamento: quantidade, total das parcelas e default de descricao.
test("Q4 regime de pagamento", () => {
  const q = montarQuadroResumo(base());
  assert.equal(q.regime_pagamento.quantidade, 3);
  assert.equal(q.regime_pagamento.total, 10000);
  assert.equal(q.regime_pagamento.parcelas[0].is_entrada, true);
  assert.equal(q.regime_pagamento.parcelas[2].descricao, "Parcela"); // sem descricao -> default
});

// Q5 — serializacao CANONICA: independe da ordem das chaves de entrada.
test("Q5 serializacao canonica estavel", () => {
  const q = montarQuadroResumo(base());
  const a = serializarQuadroResumo({ b: 1, a: [{ y: 2, x: 1 }] });
  const b = serializarQuadroResumo({ a: [{ x: 1, y: 2 }], b: 1 });
  assert.equal(a, b);
  // o mesmo Quadro serializa identico em duas montagens.
  assert.equal(serializarQuadroResumo(q), serializarQuadroResumo(montarQuadroResumo(base())));
});

// Q6 — itens preservados com fornecedor null honesto (linha sem campus).
test("Q6 itens preservam fornecedor null", () => {
  const q = montarQuadroResumo(base());
  assert.equal(q.itens.length, 2);
  assert.equal(q.itens[1].fornecedor, null);
  assert.equal(q.itens[1].data_inicio, null);
});

// Q7 — arredondamento a 2 casas em valores e parcelas.
test("Q7 arredonda a 2 casas", () => {
  const i = base();
  i.valores.total = 100.005;
  i.parcelas = [{ numero: 1, valor: 100.005, vencimento: "2026-09-30" }];
  const q = montarQuadroResumo(i);
  assert.equal(q.valores.total, 100.01);
  assert.equal(q.regime_pagamento.total, 100.01);
});

// Q8 — mascaras robustas a entrada degenerada.
test("Q8 mascaras com entrada invalida", () => {
  assert.equal(mascararCpf("123"), "***");
  assert.equal(mascararTelefone("12"), null);
  assert.equal(mascararTelefone(null), null);
});
