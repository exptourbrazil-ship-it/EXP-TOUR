import { test } from "node:test";
import assert from "node:assert/strict";
import {
  tabelaViva,
  tabelaFutura,
  homogeneidade,
  identidadeDaTabela,
  nomeDerivado,
  gruposDeCarga,
  gruposDeFormato,
  cursosComFichaIncompleta,
  cursosSemTabela,
  cursosEmVariasTabelas,
  resumoFaixas,
  rotuloFaixa,
  type TabelaCargaHoraria,
  type CursoDaTabela,
} from "./preco-carga-horaria.ts";

const HOJE = "2026-09-23";
// Intl separa simbolo e valor por espaco NAO-SEPARAVEL; deixar explicito para o
// teste nao passar/falhar por causa de um espaco invisivel.
const NB = "\u00a0";

function curso(id: string, nome: string, lpw: number | null, fmt: CursoDaTabela["formato"]): CursoDaTabela {
  return { id, nome, lessonsPerWeek: lpw, formato: fmt };
}

function tabela(over: Partial<TabelaCargaHoraria> = {}): TabelaCargaHoraria {
  return {
    id: "t1",
    nomeCadastrado: "Tabela 1",
    unit: "week",
    currency: "EUR",
    validFrom: "2026-01-01",
    validUntil: "2026-12-31",
    status: "active",
    archivedAt: null,
    marketId: null,
    gerida: false,
    faixas: [
      { minQuantity: 1, unitPrice: 455 },
      { minQuantity: 4, unitPrice: 430 },
      { minQuantity: 12, unitPrice: 360 },
      { minQuantity: 24, unitPrice: 335 },
    ],
    cursos: [curso("c1", "General English", 25, "group")],
    ...over,
  };
}

// ── Vivacidade ──────────────────────────────────────────────────────────────

test("tabelaViva: so a publicada, nao arquivada e dentro da vigencia", () => {
  assert.equal(tabelaViva(tabela(), HOJE), true);
  assert.equal(tabelaViva(tabela({ status: "draft" }), HOJE), false);
  assert.equal(tabelaViva(tabela({ archivedAt: "2026-05-01T00:00:00Z" }), HOJE), false);
  assert.equal(tabelaViva(tabela({ validUntil: "2026-08-31" }), HOJE), false);
  // Vigencia aberta continua viva.
  assert.equal(tabelaViva(tabela({ validUntil: null }), HOJE), true);
  // O ultimo dia da vigencia ainda vale.
  assert.equal(tabelaViva(tabela({ validUntil: HOJE }), HOJE), true);
});

test("tabelaViva: a vigencia que ainda nao comecou NAO precifica hoje", () => {
  const t2027 = tabela({ validFrom: "2027-01-01", validUntil: "2027-12-31" });
  assert.equal(tabelaViva(t2027, HOJE), false);
  assert.equal(tabelaFutura(t2027, HOJE), true);
  // O primeiro dia da vigencia ja vale.
  assert.equal(tabelaViva(tabela({ validFrom: HOJE }), HOJE), true);
  assert.equal(tabelaFutura(tabela({ validFrom: HOJE }), HOJE), false);
  // Rascunho/arquivada nao viram "futura".
  assert.equal(tabelaFutura(tabela({ validFrom: "2027-01-01", status: "draft" }), HOJE), false);
  assert.equal(
    tabelaFutura(tabela({ validFrom: "2027-01-01", archivedAt: "2026-01-01T00:00:00Z" }), HOJE),
    false,
  );
});

test("homogeneidade: conta cargas e formatos distintos, ignorando ficha em branco", () => {
  assert.deepEqual(homogeneidade(tabela()), { cargas: 1, formatos: 1 });
  const mista = tabela({
    cursos: [curso("c1", "A", 25, "group"), curso("c2", "B", 20, "group"), curso("c3", "C", null, null)],
  });
  assert.deepEqual(homogeneidade(mista), { cargas: 2, formatos: 1 });
});

// ── Identidade ──────────────────────────────────────────────────────────────

test("identidadeDaTabela: predominante entre os cursos, ignorando ficha em branco", () => {
  const t = tabela({
    cursos: [
      curso("c1", "General English", 25, "group"),
      curso("c2", "Business English", 25, "group"),
      curso("c3", "Sem ficha", null, null),
    ],
  });
  assert.deepEqual(identidadeDaTabela(t), { lessonsPerWeek: 25, formato: "group" });
});

test("identidadeDaTabela: empate vira null (nao escolhe por ordem de linha)", () => {
  const t = tabela({
    cursos: [curso("c1", "A", 20, "group"), curso("c2", "B", 30, "one_to_one")],
  });
  assert.deepEqual(identidadeDaTabela(t), { lessonsPerWeek: null, formato: null });
});

test("identidadeDaTabela: tabela sem curso etiquetado nao afirma nada", () => {
  assert.deepEqual(identidadeDaTabela(tabela({ cursos: [] })), { lessonsPerWeek: null, formato: null });
});

test("nomeDerivado: monta o nome; singular; parcial; e null quando nao da", () => {
  assert.equal(nomeDerivado({ lessonsPerWeek: 25, formato: "group" }), "25 aulas por semana · Em grupo");
  assert.equal(nomeDerivado({ lessonsPerWeek: 1, formato: null }), "1 aula por semana");
  assert.equal(nomeDerivado({ lessonsPerWeek: null, formato: "one_to_one" }), "Individual");
  assert.equal(nomeDerivado({ lessonsPerWeek: null, formato: null }), null);
});

// ── Composicao da tabela ────────────────────────────────────────────────────────────

test("gruposDeCarga: agrupa por carga, maior grupo primeiro", () => {
  const t = tabela({
    cursos: [
      curso("c1", "General English", 25, "group"),
      curso("c2", "General English II", 25, "group"),
      curso("c3", "Business English", 30, "group"),
    ],
  });
  const g = gruposDeCarga(t);
  assert.equal(g.length, 2);
  assert.equal(g[0].valor, 25);
  assert.deepEqual(g[0].cursos.map((c) => c.id), ["c1", "c2"]);
  assert.equal(g[1].valor, 30);
});

test("gruposDeCarga: dois cursos de cargas diferentes tambem sao mostrados", () => {
  // Caso que a regra antiga silenciava: sem maioria, nao havia aviso nenhum,
  // embora a tabela cobrisse mesmo duas cargas.
  const t = tabela({ cursos: [curso("c1", "A", 25, "group"), curso("c2", "B", 20, "group")] });
  assert.deepEqual(homogeneidade(t), { cargas: 2, formatos: 1 });
  assert.deepEqual(gruposDeCarga(t).map((g) => g.valor), [20, 25]); // empate: ordem pelo valor
});

test("gruposDeFormato: o formato agrupa sozinho — mesma carga custa 2,4x na Rennert", () => {
  const t = tabela({
    cursos: [curso("c1", "A", 20, "group"), curso("c2", "B", 20, "group"), curso("c3", "Individual", 20, "one_to_one")],
  });
  const g = gruposDeFormato(t);
  assert.deepEqual(g.map((x) => x.valor), ["group", "one_to_one"]);
  assert.deepEqual(g[1].cursos.map((c) => c.id), ["c3"]);
});

test("grupos: ficha em branco fica de fora do agrupamento", () => {
  const t = tabela({ cursos: [curso("c1", "A", 25, "group"), curso("c2", "B", null, null)] });
  assert.deepEqual(gruposDeCarga(t).map((g) => g.valor), [25]);
  assert.deepEqual(homogeneidade(t), { cargas: 1, formatos: 1 });
  assert.deepEqual(cursosComFichaIncompleta(t).map((c) => c.id), ["c2"]);
});

// ── As duas falhas ──────────────────────────────────────────────────────────

test("cursosSemTabela: so tabela viva precifica", () => {
  const cursos = [
    { id: "c1", nome: "General English" },
    { id: "c2", nome: "Business English" },
    { id: "c3", nome: "Orfao" },
  ];
  const viva = tabela({ id: "t1", cursos: [curso("c1", "General English", 25, "group")] });
  const morta = tabela({
    id: "t2",
    validUntil: "2025-12-31",
    cursos: [curso("c2", "Business English", 30, "group")],
  });
  const faltando = cursosSemTabela(cursos, [viva, morta], HOJE);
  assert.deepEqual(faltando.map((c) => c.id), ["c2", "c3"]);
});

test("cursosEmVariasTabelas: acusa a quebra da invariante, ignorando a tabela morta", () => {
  const a = tabela({ id: "t1", cursos: [curso("c1", "General English", 25, "group")] });
  const b = tabela({ id: "t2", cursos: [curso("c1", "General English", 25, "group")] });
  const velha = tabela({
    id: "t3",
    validUntil: "2025-12-31",
    cursos: [curso("c1", "General English", 25, "group")],
  });
  const r = cursosEmVariasTabelas([a, b, velha], HOJE);
  assert.equal(r.length, 1);
  assert.equal(r[0].curso.id, "c1");
  assert.deepEqual(r[0].tabelaIds, ["t1", "t2"]);

  // Um curso numa tabela viva e numa vencida NAO quebra a invariante: e a
  // renovacao de vigencia, exatamente o que se espera em setembro.
  assert.deepEqual(cursosEmVariasTabelas([a, velha], HOJE), []);
});

test("cursosSemTabela: a tabela do ano que vem NAO precifica hoje", () => {
  const cursos = [{ id: "c1", nome: "General English" }];
  const futura = tabela({
    id: "t2027",
    validFrom: "2027-01-01",
    validUntil: "2027-12-31",
    cursos: [curso("c1", "General English", 25, "group")],
  });
  assert.deepEqual(cursosSemTabela(cursos, [futura], HOJE).map((c) => c.id), ["c1"]);
});

test("cursosEmVariasTabelas: tabela geral + tabela de mercado NAO e ambiguidade", () => {
  const geral = tabela({ id: "t1", marketId: null, cursos: [curso("c1", "GE", 25, "group")] });
  const brasil = tabela({ id: "t2", marketId: "m-br", cursos: [curso("c1", "GE", 25, "group")] });
  // O motor prefere a especifica de proposito — nao ha o que corrigir.
  assert.deepEqual(cursosEmVariasTabelas([geral, brasil], HOJE), []);

  // Duas no MESMO mercado continuam sendo ambiguidade real.
  const outraBR = tabela({ id: "t3", marketId: "m-br", cursos: [curso("c1", "GE", 25, "group")] });
  const r = cursosEmVariasTabelas([brasil, outraBR], HOJE);
  assert.equal(r.length, 1);
  assert.deepEqual(r[0].tabelaIds, ["t2", "t3"]);
});

test("cursosEmVariasTabelas: a renovacao de vigencia nao dispara alerta", () => {
  const atual = tabela({ id: "t1", validFrom: "2026-01-01", validUntil: "2026-12-31", cursos: [curso("c1", "GE", 25, "group")] });
  const proxima = tabela({ id: "t2", validFrom: "2027-01-01", validUntil: "2027-12-31", cursos: [curso("c1", "GE", 25, "group")] });
  assert.deepEqual(cursosEmVariasTabelas([atual, proxima], HOJE), []);
});

// ── Apresentacao ────────────────────────────────────────────────────────────

test("resumoFaixas: escada, faixa unica, faixas iguais e vazio", () => {
  assert.equal(resumoFaixas(tabela().faixas, "EUR"), `€${NB}455 → €${NB}335`);
  assert.equal(resumoFaixas([{ minQuantity: 1, unitPrice: 200 }], "EUR"), `€${NB}200 fixo`);
  assert.equal(
    resumoFaixas([{ minQuantity: 1, unitPrice: 200 }, { minQuantity: 4, unitPrice: 200 }], "EUR"),
    `€${NB}200 fixo`,
  );
  assert.equal(resumoFaixas([], "EUR"), "sem faixa");
});

test("resumoFaixas: ordem das linhas nao muda o resumo", () => {
  const desordenada = [
    { minQuantity: 24, unitPrice: 335 },
    { minQuantity: 1, unitPrice: 455 },
    { minQuantity: 4, unitPrice: 430 },
  ];
  assert.equal(resumoFaixas(desordenada, "EUR"), `€${NB}455 → €${NB}335`);
});

test("rotuloFaixa: intervalo fechado, faixa de um so valor e a ultima aberta", () => {
  const f = tabela().faixas;
  assert.equal(rotuloFaixa(f, 0, "week"), "1 a 3 semanas");
  assert.equal(rotuloFaixa(f, 1, "week"), "4 a 11 semanas");
  assert.equal(rotuloFaixa(f, 3, "week"), "24+ semanas");
  const curta = [{ minQuantity: 1, unitPrice: 10 }, { minQuantity: 2, unitPrice: 9 }];
  assert.equal(rotuloFaixa(curta, 0, "week"), "1 semanas");
  assert.equal(rotuloFaixa(f, 9, "week"), "");
});

test("formatarDinheiro nao derruba a tela com moeda fora do ISO", () => {
  assert.equal(resumoFaixas([{ minQuantity: 1, unitPrice: 10 }], "XXXX"), "XXXX 10 fixo");
});
