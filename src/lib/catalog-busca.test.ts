import { test } from "node:test";
import assert from "node:assert/strict";
import { faixaDe, filtrarItensCatalogo, type ItemCatalogo } from "./catalog-busca.ts";

function item(p: Partial<ItemCatalogo> & { id: string; name: string }): ItemCatalogo {
  return {
    kind: "program",
    campusId: "c1",
    school: "LSI",
    city: "London",
    country: "UK",
    flag: "🇬🇧",
    currency: "GBP",
    minWeeks: 1,
    maxWeeks: 52,
    courseType: null,
    ...p,
  };
}

test("faixaDe: sem max declarado, o produto e um pacote FIXO de min semanas", () => {
  assert.deepEqual(faixaDe({ minWeeks: 2, maxWeeks: 0 }), { min: 2, max: 2 });
});

test("faixaDe: sem min declarado, nao ha restricao de duracao", () => {
  assert.equal(faixaDe({ minWeeks: 0, maxWeeks: 0 }), null);
  assert.equal(faixaDe({ minWeeks: 0, maxWeeks: 12 }), null);
});

test("duracao fora da faixa sai de resultados e vira aviso", () => {
  const itens = [
    item({ id: "a", name: "General English", minWeeks: 2, maxWeeks: 12 }),
    item({ id: "b", name: "Intensive English", minWeeks: 8, maxWeeks: 24 }),
  ];
  const { resultados, foraDaFaixa } = filtrarItensCatalogo({ itens, termo: "english", weeks: 4 });
  assert.deepEqual(resultados.map((r) => r.id), ["a"]);
  assert.deepEqual(foraDaFaixa.map((f) => f.id), ["b"]);
});

test("weeks null desliga o filtro de duracao", () => {
  const itens = [item({ id: "b", name: "Intensive English", minWeeks: 8, maxWeeks: 24 })];
  const { resultados, foraDaFaixa } = filtrarItensCatalogo({ itens, termo: "", weeks: null });
  assert.equal(resultados.length, 1);
  assert.equal(foraDaFaixa.length, 0);
});

test("item sem duracao declarada nunca cai em foraDaFaixa", () => {
  const itens = [item({ id: "s", name: "Seguro saúde", kind: "insurance", minWeeks: 0, maxWeeks: 0 })];
  const { resultados, foraDaFaixa } = filtrarItensCatalogo({ itens, termo: "", weeks: 52 });
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
    filtrarItensCatalogo({ itens, termo: "", pais: "Malta", weeks: 4 }).resultados.map((r) => r.id),
    ["mt"],
  );
  assert.deepEqual(
    filtrarItensCatalogo({ itens, termo: "", kinds: ["accommodation"], weeks: 4 }).resultados.map((r) => r.id),
    ["ac"],
  );
  // "todos" e o mesmo que sem filtro de pais.
  assert.equal(filtrarItensCatalogo({ itens, termo: "", pais: "todos", weeks: 4 }).resultados.length, 3);
});

test("termo vazio devolve tudo que passa nos demais filtros", () => {
  const itens = [item({ id: "a", name: "General English" }), item({ id: "b", name: "Homestay", kind: "accommodation" })];
  assert.equal(filtrarItensCatalogo({ itens, termo: "", weeks: 4 }).resultados.length, 2);
});

test("termo casa nome, escola e cidade — nome vem primeiro", () => {
  const itens = [
    item({ id: "cidade", name: "General English", city: "Boston", school: "NESE" }),
    item({ id: "escola", name: "General English", city: "London", school: "Boston Academy" }),
    item({ id: "nome", name: "Boston Business English", city: "London", school: "LSI" }),
  ];
  const { resultados } = filtrarItensCatalogo({ itens, termo: "boston", weeks: 4 });
  assert.deepEqual(resultados.map((r) => r.id), ["nome", "escola", "cidade"]);
});

test("termo que nao casa nada devolve lista vazia, sem aviso de faixa", () => {
  const itens = [item({ id: "a", name: "General English" })];
  const { resultados, foraDaFaixa } = filtrarItensCatalogo({ itens, termo: "zzzz", weeks: 4 });
  assert.equal(resultados.length, 0);
  assert.equal(foraDaFaixa.length, 0);
});

test("pacote fixo so aparece na duracao exata", () => {
  const itens = [item({ id: "p", name: "9 Day Compact", minWeeks: 2, maxWeeks: 0 })];
  assert.equal(filtrarItensCatalogo({ itens, termo: "", weeks: 2 }).resultados.length, 1);
  const outra = filtrarItensCatalogo({ itens, termo: "compact", weeks: 3 });
  assert.equal(outra.resultados.length, 0);
  assert.deepEqual(outra.foraDaFaixa, [{ id: "p", name: "9 Day Compact", school: "LSI", minWeeks: 2, maxWeeks: 2 }]);
});
