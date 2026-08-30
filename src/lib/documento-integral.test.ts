import { test } from "node:test";
import assert from "node:assert/strict";
import {
  montarDocumentoIntegral,
  fmtDinheiro,
  type DocumentoIntegralInput,
} from "./documento-integral.ts";

function snapshot() {
  return {
    schema_versao: 1,
    contratante: { nome: "Maria Silva", cpf_mascarado: "123.***.***-00", email: "maria@ex.com", telefone_mascarado: "••••4321" },
    participante: { nome: "João Silva", pais_destino: "canada" },
    programa: { nome: "Inglês Geral", fornecedor: "ILAC", referencia: "COT-2026-001", opcao_numero: 1, data_inicio: "2026-10-01" },
    valores: { moeda: "CAD", total: 10000, entrada: 2000, saldo: 8000 },
    regime_pagamento: {
      quantidade: 2,
      total: 10000,
      parcelas: [
        { numero: 0, descricao: "Entrada", valor: 2000, vencimento: "2026-09-05", is_entrada: true },
        { numero: 1, descricao: "Parcela 1/1", valor: 8000, vencimento: "2026-09-30", is_entrada: false },
      ],
    },
    itens: [
      { grupo: "program", nome: "Inglês Geral", valor: 8000, moeda: "CAD", data_inicio: "2026-10-01", fornecedor: "ILAC" },
      { grupo: "insurance", nome: "Seguro", valor: 2000, moeda: "CAD", data_inicio: null, fornecedor: null },
    ],
    termo: { versao: "v3", hash: "abc" },
    gerado_em: "2026-08-30T12:00:00.000Z",
  };
}

function base(): DocumentoIntegralInput {
  return {
    contrato: {
      id: "c1", nome: "Inglês Geral", moeda: "CAD", valorTotal: 10000,
      estudanteNome: "João Silva", paisDestino: "canada", dataInicio: "2026-10-01",
      criadoEm: "2026-08-30T12:00:00.000Z", canceladoEm: null, sessionId: "sid-abc-123",
    },
    titularNome: "Maria Silva",
    quadroResumo: snapshot(),
    condicoesGerais: { versao: "v3", hash: "abc", conteudo: "1. Objeto...\n2. ..." },
    anexoIII: [
      { fornecedor: "ILAC", natureza: "Programa", valor: 8000, moeda: "CAD", prazo: "Ate 01/09/2026", evento: null, documento_viabiliza: null, consequencia_atraso: null, politica_cancelamento: "Reembolso escalonado", fonte: "Cotacao COT-2026-001", ordem: 0 },
    ],
    aceite: { dataHora: "2026-08-30T12:00:00.000Z", ip: "203.0.113.5", versao: "v3", hashConteudo: "abc" },
    spread: 0.05,
    iof: 0.035,
  };
}

// D1 — documento completo quando QR + Condições + aceite presentes.
test("D1 documento completo", () => {
  const d = montarDocumentoIntegral(base());
  assert.equal(d.completo, true);
  assert.equal(d.avisos.length, 0);
  assert.equal(d.referencia, "COT-2026-001");
  assert.equal(d.quadroResumo.presente, true);
});

// D2 — blocos do Quadro Resumo montados na ordem esperada.
test("D2 blocos do Quadro Resumo", () => {
  const d = montarDocumentoIntegral(base());
  const titulos = d.quadroResumo.blocos.map((b) => b.titulo);
  assert.deepEqual(titulos, ["Contratante", "Participante", "Programa", "Valores", "Regime de pagamento", "Itens da opção"]);
  const valores = d.quadroResumo.blocos.find((b) => b.titulo === "Valores")!;
  assert.equal(valores.linhas.find((l) => l.rotulo === "Saldo")!.valor, "CAD 8.000,00");
});

// D3 — snapshot ausente: incompleto + aviso, sem quebrar.
test("D3 snapshot ausente", () => {
  const i = base();
  i.quadroResumo = null;
  const d = montarDocumentoIntegral(i);
  assert.equal(d.quadroResumo.presente, false);
  assert.equal(d.completo, false);
  assert.ok(d.avisos.some((a) => a.includes("Quadro Resumo indisponível")));
  // referencia cai no nome do contrato quando nao ha snapshot.
  assert.equal(d.referencia, "Inglês Geral");
});

// D4 — Condições Gerais vazias: incompleto + aviso.
test("D4 condicoes gerais ausentes", () => {
  const i = base();
  i.condicoesGerais = { versao: "v3", hash: "abc", conteudo: "   " };
  const d = montarDocumentoIntegral(i);
  assert.equal(d.condicoesGerais.presente, false);
  assert.equal(d.completo, false);
});

// D5 — Anexo II usa os percentuais VIGENTES passados (config, nao hardcoded).
test("D5 anexo II parametrizado", () => {
  const i = base();
  i.spread = 0.066;
  i.iof = 0.035;
  const d = montarDocumentoIntegral(i);
  const taxa = d.anexoII.componentes.find((l) => l.rotulo === "Taxa de Intermediação e Câmbio")!;
  assert.equal(taxa.valor, "6,6% (vigente)");
});

// D6 — prova do aceite inclui IP, versão, hash e sessão (do contrato).
test("D6 prova do aceite", () => {
  const d = montarDocumentoIntegral(base());
  assert.equal(d.aceite.presente, true);
  const linhas = Object.fromEntries(d.aceite.linhas.map((l) => [l.rotulo, l.valor]));
  assert.equal(linhas["Endereço IP"], "203.0.113.5");
  assert.equal(linhas["Identificador de sessão"], "sid-abc-123");
  assert.equal(linhas["Versão das Condições Gerais"], "v3");
});

// D7 — contrato cancelado emite aviso e marca a flag.
test("D7 contrato cancelado", () => {
  const i = base();
  i.contrato.canceladoEm = "2026-09-01T10:00:00.000Z";
  const d = montarDocumentoIntegral(i);
  assert.equal(d.cancelado, true);
  assert.ok(d.avisos.some((a) => a.includes("cancelado")));
});

// D8 — Anexo III ordenado por `ordem`.
test("D8 anexo III ordenado", () => {
  const i = base();
  i.anexoIII = [
    { fornecedor: "B", natureza: null, valor: null, moeda: null, prazo: null, evento: null, documento_viabiliza: null, consequencia_atraso: null, politica_cancelamento: null, fonte: null, ordem: 2 },
    { fornecedor: "A", natureza: null, valor: null, moeda: null, prazo: null, evento: null, documento_viabiliza: null, consequencia_atraso: null, politica_cancelamento: null, fonte: null, ordem: 1 },
  ];
  const d = montarDocumentoIntegral(i);
  assert.deepEqual(d.anexoIII.itens.map((b) => b.titulo), ["A", "B"]);
});

// D10 — avisa quando a versao exibida das CG difere da registrada no aceite.
test("D10 divergencia de versao do termo", () => {
  const i = base();
  i.condicoesGerais = { versao: "v4", hash: "def", conteudo: "texto v4" };
  i.aceite = { dataHora: "2026-08-30T12:00:00.000Z", ip: "203.0.113.5", versao: "v3", hashConteudo: "abc" };
  const d = montarDocumentoIntegral(i);
  assert.ok(d.avisos.some((a) => a.includes("difere da registrada no aceite")));
  // mesma versao -> sem aviso de divergencia.
  const ok = montarDocumentoIntegral(base());
  assert.ok(!ok.avisos.some((a) => a.includes("difere da registrada")));
});

// D9 — formatador de dinheiro deterministico (sem Intl).
test("D9 fmtDinheiro", () => {
  assert.equal(fmtDinheiro(1234.5, "CAD"), "CAD 1.234,50");
  assert.equal(fmtDinheiro(1000000, "BRL"), "BRL 1.000.000,00");
  assert.equal(fmtDinheiro(0, null), "0,00");
  assert.equal(fmtDinheiro(-50.1, "USD"), "-USD 50,10");
});
