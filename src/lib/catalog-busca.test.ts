import { test } from "node:test";
import assert from "node:assert/strict";
import { faixaDe, filtrarItensCatalogo, labelUnidade, type ItemCatalogo } from "./catalog-busca.ts";

function item(p: Partial<ItemCatalogo> & { id: string; name: string }): ItemCatalogo {
  return {
    kind: "program",
    campusId: "c1",
    school: "LSI",
    city: "London",
    country: "UK",
    flag: "🇬🇧",
    currency: "GBP",
    minQtd: 1,
    maxQtd: 52,
    courseType: null,
    unit: "week",
    ...p,
  };
}

test("faixaDe: sem max declarado, o produto e um pacote FIXO de min unidades", () => {
  assert.deepEqual(faixaDe({ minQtd: 2, maxQtd: 0 }), { min: 2, max: 2 });
});

test("faixaDe: sem min declarado, nao ha restricao de duracao", () => {
  assert.equal(faixaDe({ minQtd: 0, maxQtd: 0 }), null);
  assert.equal(faixaDe({ minQtd: 0, maxQtd: 12 }), null);
});

test("duracao fora da faixa sai de resultados e vira aviso", () => {
  const itens = [
    item({ id: "a", name: "General English", minQtd: 2, maxQtd: 12 }),
    item({ id: "b", name: "Intensive English", minQtd: 8, maxQtd: 24 }),
  ];
  const { resultados, foraDaFaixa } = filtrarItensCatalogo({ itens, termo: "english", quantidade: 4 });
  assert.deepEqual(resultados.map((r) => r.id), ["a"]);
  assert.deepEqual(foraDaFaixa.map((f) => f.id), ["b"]);
});

test("weeks null desliga o filtro de duracao", () => {
  const itens = [item({ id: "b", name: "Intensive English", minQtd: 8, maxQtd: 24 })];
  const { resultados, foraDaFaixa } = filtrarItensCatalogo({ itens, termo: "", quantidade: null });
  assert.equal(resultados.length, 1);
  assert.equal(foraDaFaixa.length, 0);
});

test("item sem duracao declarada nunca cai em foraDaFaixa", () => {
  const itens = [item({ id: "s", name: "Seguro saúde", kind: "insurance", minQtd: 0, maxQtd: 0 })];
  const { resultados, foraDaFaixa } = filtrarItensCatalogo({ itens, termo: "", quantidade: 52 });
  assert.deepEqual(resultados.map((r) => r.id), ["s"]);
  assert.equal(foraDaFaixa.length, 0);
});

test("filtro de pais e de tipo sao aplicados", () => {
  const itens = [
    item({ id: "uk", name: "General English", country: "UK" }),
    item({ id: "mt", name: "General English", country: "Malta" }),
    item({ id: "ac", name: "Homestay", kind: "accommodation", country: "UK" }),
  ];
  assert.deepEqual(
    filtrarItensCatalogo({ itens, termo: "", pais: "Malta", quantidade: 4 }).resultados.map((r) => r.id),
    ["mt"],
  );
  assert.deepEqual(
    filtrarItensCatalogo({ itens, termo: "", kinds: ["accommodation"], quantidade: 4 }).resultados.map((r) => r.id),
    ["ac"],
  );
  // "todos" e o mesmo que sem filtro de pais.
  assert.equal(filtrarItensCatalogo({ itens, termo: "", pais: "todos", quantidade: 4 }).resultados.length, 3);
});

test("termo vazio devolve tudo que passa nos demais filtros", () => {
  const itens = [item({ id: "a", name: "General English" }), item({ id: "b", name: "Homestay", kind: "accommodation" })];
  assert.equal(filtrarItensCatalogo({ itens, termo: "", quantidade: 4 }).resultados.length, 2);
});

test("termo casa nome, escola e cidade — nome vem primeiro", () => {
  const itens = [
    item({ id: "cidade", name: "General English", city: "Boston", school: "NESE" }),
    item({ id: "escola", name: "General English", city: "London", school: "Boston Academy" }),
    item({ id: "nome", name: "Boston Business English", city: "London", school: "LSI" }),
  ];
  const { resultados } = filtrarItensCatalogo({ itens, termo: "boston", quantidade: 4 });
  assert.deepEqual(resultados.map((r) => r.id), ["nome", "escola", "cidade"]);
});

test("termo que nao casa nada devolve lista vazia, sem aviso de faixa", () => {
  const itens = [item({ id: "a", name: "General English" })];
  const { resultados, foraDaFaixa } = filtrarItensCatalogo({ itens, termo: "zzzz", quantidade: 4 });
  assert.equal(resultados.length, 0);
  assert.equal(foraDaFaixa.length, 0);
});

test("pacote fixo so aparece na duracao exata", () => {
  const itens = [item({ id: "p", name: "9 Day Compact", minQtd: 2, maxQtd: 0 })];
  assert.equal(filtrarItensCatalogo({ itens, termo: "", quantidade: 2 }).resultados.length, 1);
  const outra = filtrarItensCatalogo({ itens, termo: "compact", quantidade: 3 });
  assert.equal(outra.resultados.length, 0);
  assert.deepEqual(outra.foraDaFaixa, [
    { id: "p", name: "9 Day Compact", school: "LSI", minQtd: 2, maxQtd: 2, unit: "week" },
  ]);
});

test("campusId restringe aos itens do campus escolhido (passos 2 e 3)", () => {
  const itens = [
    item({ id: "a", name: "Homestay", kind: "accommodation", campusId: "c1" }),
    item({ id: "b", name: "Homestay", kind: "accommodation", campusId: "c2" }),
  ];
  assert.deepEqual(
    filtrarItensCatalogo({ itens, termo: "", campusId: "c1", quantidade: 4 }).resultados.map((r) => r.id),
    ["a"],
  );
  // Sem campusId (ou null) nao restringe.
  assert.equal(filtrarItensCatalogo({ itens, termo: "", campusId: null, quantidade: 4 }).resultados.length, 2);
});

test("a faixa vale na UNIDADE do item: noite extra 1-14 sao noites, nao semanas", () => {
  const noite = item({ id: "n", name: "Noite extra", kind: "other", unit: "day", minQtd: 1, maxQtd: 14 });
  // 20 noites estoura a faixa; 10 noites cabe.
  assert.equal(filtrarItensCatalogo({ itens: [noite], termo: "", quantidade: 20 }).resultados.length, 0);
  assert.equal(filtrarItensCatalogo({ itens: [noite], termo: "", quantidade: 10 }).resultados.length, 1);
  // E o aviso reporta a unidade certa.
  const fora = filtrarItensCatalogo({ itens: [noite], termo: "noite", quantidade: 20 }).foraDaFaixa;
  assert.equal(fora[0].unit, "day");
});

test("labelUnidade distingue semana de noite e trata o singular", () => {
  assert.equal(labelUnidade("week", 1), "1 semana");
  assert.equal(labelUnidade("week", 4), "4 semanas");
  assert.equal(labelUnidade("day", 1), "1 noite");
  assert.equal(labelUnidade("day", 3), "3 noites");
});
