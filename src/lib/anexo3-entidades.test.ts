import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validarItemDoPrograma,
  custoDoPrograma,
  componenteEducacional,
  aplicarTetoRemuneracao,
  TETO_REMUNERACAO_MOEDA_REFERENCIA,
  validarTaxaObrigatoria,
  taxaAplicavel,
  entradaPorMoeda,
  validarExigenciaAntecipacao,
  validarEscolaCampusPolitica,
  inicioAlemDoIntake,
  type ItemDoPrograma,
  type TaxaObrigatoria,
} from "./anexo3-entidades.ts";

function itens(): ItemDoPrograma[] {
  return [
    { programaId: "p1", fornecedorId: null, descricao: "Curso 24 sem", valor: 9600, moeda: "CAD", componente: "educacional" },
    { programaId: "p1", fornecedorId: null, descricao: "Acomodação", valor: 2400, moeda: "CAD", componente: "educacional" },
    { programaId: "p1", fornecedorId: null, descricao: "Seguro", valor: 500, moeda: "CAD", componente: "terceiro" },
    { programaId: "p1", fornecedorId: null, descricao: "Passagem", valor: 4000, moeda: "CAD", componente: "terceiro" },
  ];
}

// ── Componente Educacional (Cláusula 1.1.g.1 / I.2.8) ────────────────────────

test("Custo do Programa soma tudo; Componente Educacional só o educacional", () => {
  const its = itens();
  assert.equal(custoDoPrograma(its), 16500);
  assert.equal(componenteEducacional(its), 12000);
});

test("Componente Educacional é a base da Remuneração, nunca o Custo do Programa", () => {
  const its = itens();
  // 5% sobre Componente Educacional (12000) = 600, não sobre o Custo (16500 -> 825).
  const cinco = componenteEducacional(its) * 0.05;
  assert.equal(cinco, 600);
  assert.notEqual(cinco, custoDoPrograma(its) * 0.05);
});

test("teto da Remuneração é 800 na moeda de referência, aplicado sem conversão", () => {
  assert.equal(TETO_REMUNERACAO_MOEDA_REFERENCIA, 800);
  assert.equal(aplicarTetoRemuneracao(600), 600);
  assert.equal(aplicarTetoRemuneracao(1000), 800);
  assert.equal(aplicarTetoRemuneracao(-5), 0);
});

test("validarItemDoPrograma exige componente válido", () => {
  const ok = validarItemDoPrograma({ programaId: "p1", descricao: "x", valor: 10, moeda: "cad", componente: "educacional" });
  assert.equal(ok.ok, true);
  if (ok.ok) assert.equal(ok.valor.moeda, "CAD");
  const bad = validarItemDoPrograma({ programaId: "p1", descricao: "x", valor: 10, moeda: "CAD", componente: "misto" });
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.ok(bad.erros.some((e) => e.campo === "componente"));
});

// ── TaxaObrigatoria + Entrada ────────────────────────────────────────────────

function taxa(over: Partial<TaxaObrigatoria> = {}): TaxaObrigatoria {
  return {
    escolaCampusId: "c1",
    nome: "Matrícula",
    valor: 150,
    moeda: "CAD",
    condicaoAplicacao: "sempre",
    reembolsavel: false,
    vencimentoDias: 5,
    componente: "educacional",
    ...over,
  };
}

test("taxaAplicavel respeita a condição de aplicação", () => {
  assert.equal(taxaAplicavel(taxa({ condicaoAplicacao: "sempre" }), {}), true);
  assert.equal(taxaAplicavel(taxa({ condicaoAplicacao: "com_acomodacao" }), { temAcomodacao: false }), false);
  assert.equal(taxaAplicavel(taxa({ condicaoAplicacao: "com_acomodacao" }), { temAcomodacao: true }), true);
  assert.equal(taxaAplicavel(taxa({ condicaoAplicacao: "duracao_min" }), { duracaoSemanas: 10, duracaoMinima: 12 }), false);
  assert.equal(taxaAplicavel(taxa({ condicaoAplicacao: "duracao_min" }), { duracaoSemanas: 12, duracaoMinima: 12 }), true);
});

test("entradaPorMoeda soma só as aplicáveis, por moeda", () => {
  const taxas = [
    taxa({ nome: "Matrícula", valor: 150, moeda: "CAD", condicaoAplicacao: "sempre" }),
    taxa({ nome: "Acomodação", valor: 200, moeda: "CAD", condicaoAplicacao: "com_acomodacao" }),
    taxa({ nome: "Courier", valor: 40, moeda: "USD", condicaoAplicacao: "sempre" }),
  ];
  assert.deepEqual(entradaPorMoeda(taxas, { temAcomodacao: true }), { CAD: 350, USD: 40 });
  assert.deepEqual(entradaPorMoeda(taxas, { temAcomodacao: false }), { CAD: 150, USD: 40 });
});

test("validarTaxaObrigatoria rejeita moeda e componente inválidos", () => {
  const bad = validarTaxaObrigatoria({ escolaCampusId: "c1", nome: "x", valor: 10, moeda: "REAIS", condicaoAplicacao: "sempre", reembolsavel: false, vencimentoDias: 3, componente: "educacional" });
  assert.equal(bad.ok, false);
  const ok = validarTaxaObrigatoria(taxa());
  assert.equal(ok.ok, true);
});

test("condicao duracao_min exige duracaoMinimaSemanas (>=1); rejeita negativos", () => {
  const semDur = validarTaxaObrigatoria(taxa({ condicaoAplicacao: "duracao_min" }));
  assert.equal(semDur.ok, false);
  const comDur = validarTaxaObrigatoria({ ...taxa({ condicaoAplicacao: "duracao_min" }), duracaoMinimaSemanas: 12 });
  assert.equal(comDur.ok, true);
  if (comDur.ok) assert.equal(comDur.valor.duracaoMinimaSemanas, 12);
  const ordemNeg = validarTaxaObrigatoria({ ...taxa(), ordem: -1 });
  assert.equal(ordemNeg.ok, false);
  const durNeg = validarTaxaObrigatoria({ ...taxa(), duracaoMinimaSemanas: -5 });
  assert.equal(durNeg.ok, false);
});

// ── ExigenciaAntecipacao (Cláusula 7.5 / 7.5.1) ──────────────────────────────

test("exigência ativa SEM comprovante é bloqueada (Cláusula 7.5.1)", () => {
  const r = validarExigenciaAntecipacao({
    escolaCampusId: "c1",
    ativa: true,
    eventoGerador: "emissao_documento_visto",
    documentoViabilizado: "LOA",
    valor: 500,
    moeda: "CAD",
    dataLimiteAncora: "inicio_curso",
    dataLimiteUnidade: "dias_corridos",
    dataLimiteValor: 60,
    comprovanteRef: "",
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.erros.some((e) => e.campo === "comprovanteRef"));
});

test("exigência aceita valor XOR percentual, e valor exige moeda", () => {
  const ambos = validarExigenciaAntecipacao({ escolaCampusId: "c1", ativa: false, eventoGerador: "confirmacao_reserva", documentoViabilizado: "x", valor: 100, percentual: 10, dataLimiteAncora: "reserva", dataLimiteUnidade: "dias_corridos", dataLimiteValor: 14 });
  assert.equal(ambos.ok, false);
  const semMoeda = validarExigenciaAntecipacao({ escolaCampusId: "c1", ativa: false, eventoGerador: "confirmacao_reserva", documentoViabilizado: "x", valor: 100, dataLimiteAncora: "reserva", dataLimiteUnidade: "dias_corridos", dataLimiteValor: 14 });
  assert.equal(semMoeda.ok, false);
  const pct = validarExigenciaAntecipacao({ escolaCampusId: "c1", ativa: false, eventoGerador: "confirmacao_reserva", documentoViabilizado: "x", percentual: 20, dataLimiteAncora: "reserva", dataLimiteUnidade: "dias_corridos", dataLimiteValor: 14 });
  assert.equal(pct.ok, true);
});

// ── EscolaCampusPolitica ─────────────────────────────────────────────────────

function escola(over: Record<string, unknown> = {}) {
  return {
    escolaCampusId: "c1",
    moeda: "CAD",
    prazoPagamentoAncora: "inicio_curso",
    prazoPagamentoUnidade: "dias_corridos",
    prazoPagamentoValor: 30,
    reembolsoDestinatario: "agencia",
    reembolsoPrazoDias: 20,
    reembolsoForma: "dinheiro",
    politicaFonte: "contrato_representacao",
    protecaoEstudantil: "nenhum",
    ...over,
  };
}

test("política de campus válida normaliza a moeda", () => {
  const r = validarEscolaCampusPolitica(escola({ moeda: "cad" }));
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.valor.moeda, "CAD");
});

test("forma=credito exige validade em meses", () => {
  const bad = validarEscolaCampusPolitica(escola({ reembolsoForma: "credito" }));
  assert.equal(bad.ok, false);
  const ok = validarEscolaCampusPolitica(escola({ reembolsoForma: "credito", creditoValidadeMeses: 12 }));
  assert.equal(ok.ok, true);
});

test("regra de pagamento em dias úteis exige o país do calendário", () => {
  const bad = validarEscolaCampusPolitica(escola({ prazoPagamentoUnidade: "dias_uteis" }));
  assert.equal(bad.ok, false);
  const ok = validarEscolaCampusPolitica(escola({ prazoPagamentoUnidade: "dias_uteis", calendarioFeriadosPais: "CA" }));
  assert.equal(ok.ok, true);
});

test("bloqueio de intake: início além do horizonte de preço confirmado", () => {
  assert.equal(inicioAlemDoIntake("2027-01-10", "2026-12-31"), true);
  assert.equal(inicioAlemDoIntake("2026-06-01", "2026-12-31"), false);
  assert.equal(inicioAlemDoIntake("2027-01-10", null), false); // sem horizonte cadastrado => não bloqueia
});
