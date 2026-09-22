// A marca "obrigatoria" da taxa passou a valer no CALCULO, nao so na tela.
// Antes, `fee.is_mandatory` era editavel no hub, gravada no banco e ignorada
// pelo motor: uma taxa marcada como opcional (um transfer de aeroporto de
// US$ 275, por exemplo) entrava calada na conta de todo estudante.
import { test } from "node:test";
import assert from "node:assert/strict";
import { separarTaxas } from "./taxa-opcional.ts";

const OPTS = { startDate: "2026-10-05", moedaPadrao: "USD", escolhidas: [] as string[] };

function taxa(over: Record<string, unknown> = {}) {
  return {
    id: "f1",
    name: "Matrícula",
    fee_type: "registration",
    charge_basis: "once_per_item",
    amount: 155,
    currency: "USD",
    is_refundable: false,
    is_mandatory: true,
    valid_from: null,
    valid_until: null,
    ...over,
  };
}

test("obrigatória é cobrada; opcional só é oferecida", () => {
  const r = separarTaxas([taxa(), taxa({ id: "f2", name: "Transfer", is_mandatory: false, amount: 275 })], OPTS);
  assert.deepEqual(r.cobradas.map((f) => f.name), ["Matrícula"]);
  assert.deepEqual(r.opcionais.map((f) => f.name), ["Transfer"]);
});

test("opcional escolhida pelo consultor volta a ser cobrada e sai da oferta", () => {
  const linhas = [taxa({ id: "f2", name: "Transfer", is_mandatory: false, amount: 275 })];
  const r = separarTaxas(linhas, { ...OPTS, escolhidas: ["f2"] });
  assert.deepEqual(r.cobradas.map((f) => f.amount), [275]);
  assert.equal(r.opcionais.length, 0);
});

// O padrao seguro e continuar cobrando: as 204 taxas do catalogo hoje tem
// is_mandatory=true, mas uma carga futura pode gravar null — e um null nao pode
// fazer a taxa sumir da conta sem ninguem pedir.
test("is_mandatory nulo ou ausente conta como obrigatória", () => {
  const r = separarTaxas([taxa({ is_mandatory: null }), taxa({ id: "f3", is_mandatory: undefined })], OPTS);
  assert.equal(r.cobradas.length, 2);
  assert.equal(r.opcionais.length, 0);
});

test("fora de vigência não é cobrada nem oferecida", () => {
  const r = separarTaxas(
    [
      taxa({ id: "f4", valid_from: "2026-11-01" }),
      taxa({ id: "f5", valid_until: "2026-09-30", is_mandatory: false }),
    ],
    OPTS,
  );
  assert.equal(r.cobradas.length, 0);
  assert.equal(r.opcionais.length, 0);
});

// Taxa com valor derivado de tabela (price_template_id) segue fora do escopo:
// `amount` nulo nao pode virar zero na conta.
test("taxa sem amount fixo fica fora das duas listas", () => {
  const r = separarTaxas([taxa({ amount: null })], OPTS);
  assert.equal(r.cobradas.length, 0);
  assert.equal(r.opcionais.length, 0);
});

test("moeda da taxa cai para a moeda do template quando ausente", () => {
  const r = separarTaxas([taxa({ currency: null })], { ...OPTS, moedaPadrao: "GBP" });
  assert.equal(r.cobradas[0].currency, "GBP");
});
