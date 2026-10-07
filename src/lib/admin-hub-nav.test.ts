import { test } from "node:test";
import assert from "node:assert/strict";
import {
  abaDoKind,
  hrefHub,
  hrefVoltarProduto,
  rotuloVoltarProduto,
  hrefProdutoNoHub,
  hrefPromocaoNoHub,
  hrefNovaPromocaoNoHub,
  hrefPromocoesDoHub,
  hrefVoltarPrecoOuTaxa,
  hrefVoltarTaxa,
  ROTULO_ABA,
  resolverFornecedorDoRegistro,
  abaEditorValida,
} from "./admin-hub-nav.ts";

test("abaDoKind mapeia cada tipo para a aba do hub", () => {
  assert.equal(abaDoKind("program"), "programas");
  assert.equal(abaDoKind("accommodation"), "acomodacao");
  assert.equal(abaDoKind("other"), "outros");
  assert.equal(abaDoKind("package"), "pacotes");
  assert.equal(abaDoKind("insurance"), "seguro");
  assert.equal(abaDoKind("xpto"), null);
  assert.equal(abaDoKind(undefined), null);
});

test("hrefHub falha fechada para a lista de fornecedores", () => {
  assert.equal(hrefHub(null), "/admin/fornecedores");
  assert.equal(hrefHub(""), "/admin/fornecedores");
  assert.equal(hrefHub("s1"), "/admin/fornecedores/s1");
  assert.equal(hrefHub("s1", "programas"), "/admin/fornecedores/s1/programas");
});

test("hrefVoltarProduto cai na aba do tipo; tipo desconhecido no inventário", () => {
  assert.equal(hrefVoltarProduto("s1", "program"), "/admin/fornecedores/s1/programas");
  assert.equal(hrefVoltarProduto("s1", "accommodation"), "/admin/fornecedores/s1/acomodacao");
  assert.equal(hrefVoltarProduto("s1", "zzz"), "/admin/fornecedores/s1");
  assert.equal(hrefVoltarProduto(null, "program"), "/admin/fornecedores");
  assert.equal(rotuloVoltarProduto("package"), "Pacotes");
  assert.equal(rotuloVoltarProduto("zzz"), "Inventário do fornecedor");
});

test("hrefs de produto e promoção dentro do hub", () => {
  assert.equal(hrefProdutoNoHub("s1", "p1"), "/admin/fornecedores/s1/produto/p1");
  assert.equal(hrefProdutoNoHub("s1", "p1", "precos"), "/admin/fornecedores/s1/produto/p1?aba=precos");
  assert.equal(hrefProdutoNoHub(null, "p1"), "/admin/fornecedores");
  assert.equal(hrefPromocoesDoHub("s1"), "/admin/fornecedores/s1/promocoes");
  assert.equal(hrefPromocaoNoHub("s1", "x"), "/admin/fornecedores/s1/promocao/x");
  assert.equal(hrefPromocaoNoHub(null, "x"), "/admin/fornecedores");
  assert.equal(hrefNovaPromocaoNoHub("s1"), "/admin/fornecedores/s1/promocao/nova");
  assert.equal(hrefNovaPromocaoNoHub("s1", "p1"), "/admin/fornecedores/s1/promocao/nova?produto=p1");
});

test("hrefVoltarPrecoOuTaxa: produto de contexto volta à aba Preços & Taxas", () => {
  assert.equal(hrefVoltarPrecoOuTaxa("s1", "p1"), "/admin/fornecedores/s1/produto/p1?aba=precos");
  assert.equal(hrefVoltarPrecoOuTaxa("s1"), "/admin/fornecedores/s1");
  assert.equal(hrefVoltarPrecoOuTaxa(null, "p1"), "/admin/fornecedores");
});

test("resolverFornecedorDoRegistro: resolve, ignora vazios e falha fechada", () => {
  const campi = [
    { id: "c1", supplierId: "s1" },
    { id: "c2", supplierId: "s1" },
    { id: "c3", supplierId: "s2" },
    { id: "c4", supplierId: null },
  ];
  assert.equal(resolverFornecedorDoRegistro(["c1"], campi), "s1");
  assert.equal(resolverFornecedorDoRegistro([null, undefined, "c2", "c1"], campi), "s1");
  assert.equal(resolverFornecedorDoRegistro(["c1", "c3"], campi), null); // ambíguo
  assert.equal(resolverFornecedorDoRegistro(["c4"], campi), null); // campus sem fornecedor
  assert.equal(resolverFornecedorDoRegistro(["fora-do-tenant"], campi), null);
  assert.equal(resolverFornecedorDoRegistro([], campi), null);
});

test("abaEditorValida só aceita abas conhecidas", () => {
  assert.equal(abaEditorValida("precos"), "precos");
  assert.equal(abaEditorValida("<script>"), null);
  assert.equal(abaEditorValida(undefined), null);
});

test("hrefHub aceita a aba Arquivados", () => {
  assert.equal(hrefHub("abc", "arquivados"), "/admin/fornecedores/abc/arquivados");
});

test("aba Taxas do hub e o destino de volta de uma taxa sem produto", () => {
  assert.equal(hrefHub("s1", "taxas"), "/admin/fornecedores/s1/taxas");
  assert.equal(ROTULO_ABA.taxas, "Taxas");
  assert.equal(hrefVoltarTaxa("s1"), "/admin/fornecedores/s1/taxas");
  assert.equal(hrefVoltarTaxa("s1", null), "/admin/fornecedores/s1/taxas");
  assert.equal(hrefVoltarTaxa("s1", "p9"), "/admin/fornecedores/s1/produto/p9?aba=precos");
  // falha fechada
  assert.equal(hrefVoltarTaxa(null, "p9"), "/admin/fornecedores");
});
