import { test } from "node:test";
import assert from "node:assert/strict";
import {
  agruparTaxasPorCampus,
  escopoTaxa,
  filtrarTaxas,
  limitarTaxas,
  valorTaxa,
  baseCobranca,
  type TaxaHubItem,
} from "./taxas-hub.ts";

const t = (o: Partial<TaxaHubItem>): TaxaHubItem => ({
  id: "x", name: "Taxa", feeType: "service", chargeBasis: "once_per_quote", amount: 50, currency: "GBP",
  isMandatory: false, campusId: "c1", appliesToKinds: [], produtos: 0, gerida: false, ...o,
});

test("filtrarTaxas: busca sem acento/caixa e filtro por tipo", () => {
  const l = [
    t({ id: "1", name: "Transfer aeroporto Heathrow (1 pessoa)" }),
    t({ id: "2", name: "Matrícula", feeType: "registration" }),
  ];
  assert.deepEqual(filtrarTaxas(l, { q: "MATRICULA" }).map((x) => x.id), ["2"]);
  assert.deepEqual(filtrarTaxas(l, { q: "heathrow" }).map((x) => x.id), ["1"]);
  assert.deepEqual(filtrarTaxas(l, { tipo: "service" }).map((x) => x.id), ["1"]);
  assert.equal(filtrarTaxas(l, {}).length, 2);
  assert.equal(filtrarTaxas(l, { q: "zzz" }).length, 0);
});

test("agruparTaxasPorCampus: ordena, mantém campus vazio e descarta campus alheio", () => {
  const campi = [{ id: "c2", name: "Londres" }, { id: "c1", name: "Bournemouth" }, { id: "c3", name: "Vazio" }];
  const g = agruparTaxasPorCampus(
    [t({ id: "a", name: "Zeta", campusId: "c1" }), t({ id: "b", name: "Alfa", campusId: "c1" }), t({ id: "c", campusId: "c2" }), t({ id: "d", campusId: "outro" })],
    campi,
  );
  assert.deepEqual(g.map((x) => x.campus.id), ["c1", "c2", "c3"]);
  assert.deepEqual(g[0].taxas.map((x) => x.id), ["b", "a"]);
  assert.equal(g[2].taxas.length, 0);
  assert.equal(g.flatMap((x) => x.taxas).some((x) => x.id === "d"), false);
});

test("limitarTaxas avisa quando há mais", () => {
  const l = Array.from({ length: 5 }, (_, i) => i);
  assert.deepEqual(limitarTaxas(l, 3), { itens: [0, 1, 2], total: 5, haMais: true });
  assert.equal(limitarTaxas(l, 5).haMais, false);
});

test("escopoTaxa, valorTaxa e baseCobranca", () => {
  assert.equal(escopoTaxa({ appliesToKinds: ["other"], produtos: 0 }), "Todos de: Outros (serviços)");
  assert.equal(escopoTaxa({ appliesToKinds: [], produtos: 1 }), "1 produto");
  assert.equal(escopoTaxa({ appliesToKinds: [], produtos: 3 }), "3 produtos");
  assert.equal(escopoTaxa({ appliesToKinds: ["program"], produtos: 2 }), "Todos de: Programas + 2 produtos");
  assert.equal(escopoTaxa({ appliesToKinds: [], produtos: 0 }), "Sem alvo definido");
  assert.equal(valorTaxa({ amount: 50, currency: "GBP" }), "50,00 GBP");
  assert.equal(valorTaxa({ amount: null, currency: null }), "por tabela");
  assert.equal(baseCobranca("per_person"), "Por pessoa");
  assert.equal(baseCobranca("xyz"), "xyz");
});
