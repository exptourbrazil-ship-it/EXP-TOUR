import { test } from "node:test";
import assert from "node:assert/strict";
import {
  kindProdutoValido,
  tipoTaxaValido,
  normalizarBusca,
  limitarBloco,
  emLotes,
  resumoProdutosLigados,
  nomesPorTabela,
  recusaRestaurarProduto,
  recusaRestaurarTaxa,
  avisoRestaurarProduto,
} from "./arquivados.ts";

test("kind/tipo: só valores da lista fechada", () => {
  assert.equal(kindProdutoValido("program"), "program");
  assert.equal(kindProdutoValido("x; drop"), null);
  assert.equal(kindProdutoValido(undefined), null);
  assert.equal(tipoTaxaValido("bank"), "bank");
  assert.equal(tipoTaxaValido("program"), null);
});

test("normalizarBusca: remove caracteres de filtro e limita o tamanho", () => {
  assert.equal(normalizarBusca("  Inglês, geral (x)% "), "Inglês geral x");
  assert.equal(normalizarBusca("%_,"), null);
  assert.equal(normalizarBusca(""), null);
  assert.equal(normalizarBusca("a".repeat(200))?.length, 80);
});

test("limitarBloco: corta no limite e sinaliza 'há mais'", () => {
  const itens = Array.from({ length: 250 }, (_, i) => i);
  const r = limitarBloco(itens, 480, 200);
  assert.equal(r.itens.length, 200);
  assert.equal(r.haMais, true);
  assert.equal(r.total, 480);
  const r2 = limitarBloco([1, 2], 2);
  assert.equal(r2.haMais, false);
});

test("emLotes: divide em blocos do tamanho pedido", () => {
  assert.deepEqual(emLotes([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(emLotes([], 2), []);
});

test("resumoProdutosLigados e nomesPorTabela", () => {
  assert.equal(resumoProdutosLigados([]), "nenhum produto ligado");
  assert.equal(resumoProdutosLigados(["A", "B", "A"]), "A, B");
  assert.equal(resumoProdutosLigados(["A", "B", "C", "D", "E"]), "A, B, C e mais 2");
  const m = nomesPorTabela(
    [
      { price_template_id: "t1", product_id: "p1" },
      { price_template_id: "t1", product_id: "p2" },
      { price_template_id: "t2", product_id: "fora" },
    ],
    new Map([["p1", "Geral"], ["p2", "Intensivo"]]),
  );
  assert.deepEqual(m.get("t1"), ["Geral", "Intensivo"]);
  assert.equal(m.has("t2"), false); // produto não resolvido (outro tenant) não aparece
});

test("recusaRestaurarProduto: precisa estar arquivado e com campus vivo", () => {
  assert.equal(recusaRestaurarProduto({ arquivado: true, campusArquivado: false }), null);
  assert.equal(recusaRestaurarProduto({ arquivado: false, campusArquivado: false })?.codigo, "nao_arquivado");
  assert.equal(recusaRestaurarProduto({ arquivado: true, campusArquivado: true })?.codigo, "campus_arquivado");
});

test("recusaRestaurarTaxa: campus, gerida e tabela de origem", () => {
  const ok = { arquivada: true, campusArquivado: false, gerida: false, tabelaOrigemArquivada: false };
  assert.equal(recusaRestaurarTaxa(ok), null);
  assert.equal(recusaRestaurarTaxa({ ...ok, arquivada: false })?.codigo, "nao_arquivado");
  assert.equal(recusaRestaurarTaxa({ ...ok, campusArquivado: true })?.codigo, "campus_arquivado");
  assert.equal(recusaRestaurarTaxa({ ...ok, gerida: true })?.codigo, "gerido");
  assert.equal(recusaRestaurarTaxa({ ...ok, tabelaOrigemArquivada: true })?.codigo, "tabela_arquivada");
});

test("avisoRestaurarProduto: deixa claro que o status não muda", () => {
  assert.match(avisoRestaurarProduto("inactive"), /inativo/);
  assert.match(avisoRestaurarProduto("active"), /não o torna ativo/);
});
