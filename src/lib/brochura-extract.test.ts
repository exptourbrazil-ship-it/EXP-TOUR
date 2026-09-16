// Testes da parte PURA da extracao de brochura (F3.2).
// Roda com o runner nativo do Node: `npm test` (node --test), sem dependencias.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizarBrochuraExtraida,
  contarSecoes,
  localeDoIdioma,
  paraHtml,
  similaridadeTokens,
  casarProdutos,
  type SecaoExtraida,
} from "./brochura-extract.ts";

test("B1 normalizar: coage tipos, descarta secao sem nome, whitelist de idioma e tipo", () => {
  const b = normalizarBrochuraExtraida({
    idioma: "EN-us",
    escola: { descricao: "  A school.  ", destaques: ["Wifi", "Wifi", 42], comodidades: ["Library"], acreditacoes: ["Languages Canada"] },
    programas: [
      { nome: "General English", tipo: "program", descricao: "Text", destaques: ["Small groups"], inclusoes: ["Materials"], exclusoes: [] },
      { nome: "", tipo: "program" }, // sem nome: fora
      { nome: "Homestay Single", tipo: "ACCOMMODATION" },
      { nome: "Weird", tipo: "hotel" }, // tipo desconhecido -> program
    ],
    notas: "n",
  });
  assert.equal(b.idioma, "en");
  assert.equal(b.escola.descricao, "A school.");
  assert.deepEqual(b.escola.destaques, ["Wifi"]); // dedupe + ignora nao-string
  assert.equal(b.programas.length, 3);
  assert.equal(b.programas[1].tipo, "accommodation");
  assert.equal(b.programas[2].tipo, "program");
  assert.equal(contarSecoes(b), 4); // 3 secoes + escola
});

test("B2 normalizar: lixo total vira objeto vazio e contarSecoes = 0", () => {
  const b = normalizarBrochuraExtraida("x");
  assert.equal(b.idioma, "en");
  assert.equal(b.programas.length, 0);
  assert.equal(contarSecoes(b), 0);
});

test("B3 locale: pt -> pt-BR, es -> es, en -> en", () => {
  assert.equal(localeDoIdioma("pt"), "pt-BR");
  assert.equal(localeDoIdioma("es"), "es");
  assert.equal(localeDoIdioma("en"), "en");
});

test("B4 paraHtml: paragrafos em <p>, tudo escapado (texto de terceiro nunca vira markup)", () => {
  assert.equal(paraHtml(null), null);
  assert.equal(paraHtml("   "), null);
  assert.equal(paraHtml("Hello\nworld\n\nSecond <b>para</b> & more"), "<p>Hello world</p><p>Second &lt;b&gt;para&lt;/b&gt; &amp; more</p>");
  assert.equal(paraHtml('<script>alert("x")</script>'), "<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;</p>");
});

test("B5 similaridade (Jaccard simetrico): ordem/acento/caixa nao importam; genericos e variantes numericas NAO casam", () => {
  assert.equal(similaridadeTokens("General English", "english general"), 1);
  assert.equal(similaridadeTokens("Inglês Geral", "ingles geral"), 1);
  assert.ok(similaridadeTokens("General English 20", "Intensive English 30") < 1);
  assert.equal(similaridadeTokens("", "x"), 0);
  // Achado M3 da revisao: nome curto/generico nao pode "casar com tudo".
  assert.ok(similaridadeTokens("English", "Business English") < 0.6);
  assert.ok(similaridadeTokens("English", "General English") < 0.6);
  // Variantes por carga horaria sao cursos DIFERENTES.
  assert.ok(similaridadeTokens("General English 20", "General English 30") < 0.6);
  // Mas "General English Course" ainda casa com "General English" (2/3).
  assert.ok(similaridadeTokens("General English Course", "General English") >= 0.6);
});

function secao(nome: string, tipo: SecaoExtraida["tipo"] = "program"): SecaoExtraida {
  return { nome, tipo, descricao: null, destaques: [], inclusoes: [], exclusoes: [] };
}

test("B6 casarProdutos: casa pelo kind certo, respeita o limiar, e um produto nao vai a duas secoes", () => {
  const produtos = [
    { id: "p1", name: "General English", kind: "program" as const },
    { id: "p2", name: "IELTS Preparation", kind: "program" as const },
    { id: "a1", name: "Homestay Single Room", kind: "accommodation" as const },
  ];
  const r = casarProdutos(
    [secao("General English Course"), secao("Homestay Single", "accommodation"), secao("Cooking Workshop"), secao("General English (evening)")],
    produtos,
  );
  assert.equal(r[0].productId, "p1");
  assert.equal(r[1].productId, "a1"); // kind accommodation casa com acomodacao
  assert.equal(r[2].productId, null); // sem produto parecido
  // Duas secoes miram p1: fica a de maior score (a primeira, 1.0); a outra solta.
  assert.equal(r[3].productId, null);
  // Uma secao 'program' NAO casa com acomodacao mesmo que o nome pareca.
  const r2 = casarProdutos([secao("Homestay Single Room", "program")], produtos);
  assert.equal(r2[0].productId, null);
});
