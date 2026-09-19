import { test } from "node:test";
import assert from "node:assert/strict";
import { validarAjusteSazonal, faixasSobrepostas, periodosSobrepostos, extensaoRecorrenteDias, dinheiro, VALOR_MAXIMO_SEMANA } from "./sazonal-admin.ts";

const base = {
  productId: "11111111-1111-1111-1111-111111111111",
  name: "Alta temporada",
  kind: "high_season",
  amountPerWeek: 40,
  currency: "usd",
  fromMonth: 6, fromDay: 14, toMonth: 8, toDay: 23,
};
const falhasDe = (r: ReturnType<typeof validarAjusteSazonal>) => (r.ok ? [] : r.falhas.map((f) => f.campo));

test("entrada valida normaliza moeda e nulos", () => {
  const r = validarAjusteSazonal({ ...base, minWeeks: "", maxWeeks: null, fromYear: "" });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.dados.currency, "USD");
  assert.equal(r.dados.minWeeks, null);
  assert.equal(r.dados.fromYear, null);
  assert.equal(r.dados.amountPerWeek, 40);
});

test("valor zero, ausente ou acima do teto e recusado", () => {
  assert.deepEqual(falhasDe(validarAjusteSazonal({ ...base, amountPerWeek: 0 })), ["amountPerWeek"]);
  assert.deepEqual(falhasDe(validarAjusteSazonal({ ...base, amountPerWeek: "abc" })), ["amountPerWeek"]);
  assert.deepEqual(falhasDe(validarAjusteSazonal({ ...base, amountPerWeek: VALOR_MAXIMO_SEMANA + 1 })), ["amountPerWeek"]);
});

test("sinal tem que casar com o tipo (evita inverter a conta)", () => {
  assert.deepEqual(falhasDe(validarAjusteSazonal({ ...base, amountPerWeek: -40 })), ["amountPerWeek"]);
  assert.deepEqual(falhasDe(validarAjusteSazonal({ ...base, kind: "low_season", amountPerWeek: 30 })), ["amountPerWeek"]);
  assert.ok(validarAjusteSazonal({ ...base, kind: "low_season", amountPerWeek: -30 }).ok);
  // 'other' aceita os dois sinais.
  assert.ok(validarAjusteSazonal({ ...base, kind: "other", amountPerWeek: -5 }).ok);
});

test("datas irreais sao recusadas", () => {
  assert.deepEqual(falhasDe(validarAjusteSazonal({ ...base, fromMonth: 13 })), ["fromMonth"]);
  assert.deepEqual(falhasDe(validarAjusteSazonal({ ...base, fromMonth: 2, fromDay: 30 })), ["fromDay"]);
  assert.ok(validarAjusteSazonal({ ...base, fromMonth: 2, fromDay: 29 }).ok, "29/fev vale (o motor ajusta)");
});

test("periodo recorrente invertido e barrado", () => {
  const r = validarAjusteSazonal({ ...base, fromMonth: 8, fromDay: 23, toMonth: 6, toDay: 14 });
  assert.deepEqual(falhasDe(r), ["toMonth"]);
  // Virada de ano curta continua valendo.
  assert.ok(validarAjusteSazonal({ ...base, fromMonth: 12, fromDay: 15, toMonth: 1, toDay: 10 }).ok);
});

test("faixa de duracao coerente", () => {
  assert.deepEqual(falhasDe(validarAjusteSazonal({ ...base, minWeeks: 8, maxWeeks: 3 })), ["maxWeeks"]);
  assert.deepEqual(falhasDe(validarAjusteSazonal({ ...base, minWeeks: 0 })), ["minWeeks"]);
  assert.ok(validarAjusteSazonal({ ...base, minWeeks: 8, maxWeeks: 23 }).ok);
});

test("moeda e tipo invalidos", () => {
  assert.deepEqual(falhasDe(validarAjusteSazonal({ ...base, currency: "EURO" })), ["currency"]);
  assert.deepEqual(falhasDe(validarAjusteSazonal({ ...base, kind: "meia_temporada" })), ["kind"]);
});

test("extensaoRecorrenteDias mede o periodo", () => {
  assert.equal(extensaoRecorrenteDias(6, 14, 8, 23), 71);
  assert.equal(extensaoRecorrenteDias(12, 15, 1, 10), 27);
});

test("faixasSobrepostas detecta cobranca dupla", () => {
  assert.equal(faixasSobrepostas({ minWeeks: 1, maxWeeks: 7 }, [{ minWeeks: 7, maxWeeks: 23 }]), true);
  assert.equal(faixasSobrepostas({ minWeeks: 1, maxWeeks: 7 }, [{ minWeeks: 8, maxWeeks: 23 }]), false);
  assert.equal(faixasSobrepostas({ minWeeks: null, maxWeeks: null }, [{ minWeeks: 8, maxWeeks: 23 }]), true);
  assert.equal(faixasSobrepostas({ minWeeks: 24, maxWeeks: null }, [{ minWeeks: 1, maxWeeks: 7 }]), false);
});

test("dinheiro aceita pt-BR e recusa ambiguo", () => {
  assert.equal(dinheiro("40"), 40);
  assert.equal(dinheiro("-30,5"), -30.5);
  assert.equal(dinheiro("1.200,50"), 1200.5);
  assert.equal(dinheiro("1200.50"), 1200.5);
  assert.equal(dinheiro("1.200"), 1200, "pt-BR: ponto e separador de milhar");
  assert.equal(dinheiro("1.2"), 1.2, "um digito depois do ponto e decimal");
  assert.equal(dinheiro("1.2345"), null, "nem milhar nem decimal valido");
  assert.equal(dinheiro("abc"), null);
  assert.equal(dinheiro(""), null);
});

test("semanas com lixo viram falha, nao null silencioso", () => {
  assert.deepEqual(falhasDe(validarAjusteSazonal({ ...base, maxWeeks: "2,5" })), ["maxWeeks"]);
  assert.deepEqual(falhasDe(validarAjusteSazonal({ ...base, minWeeks: "abc" })), ["minWeeks"]);
  const r = validarAjusteSazonal({ ...base, minWeeks: "", maxWeeks: undefined });
  assert.ok(r.ok, "vazio continua sendo 'sem limite'");
});

test("periodo com ano em uma ponta tambem e checado", () => {
  // 23/ago/2026 a 14/jun (ano inferido = 2027): quase o ano inteiro.
  assert.deepEqual(
    falhasDe(validarAjusteSazonal({ ...base, fromMonth: 8, fromDay: 23, fromYear: 2026, toMonth: 6, toDay: 14 })),
    ["toMonth"],
  );
});

test("dois anos invertidos sao recusados (sumiriam da cotacao)", () => {
  const r = validarAjusteSazonal({ ...base, fromYear: 2027, toYear: 2026 });
  assert.deepEqual(falhasDe(r), ["toYear"]);
  assert.ok(validarAjusteSazonal({ ...base, fromYear: 2026, toYear: 2026 }).ok);
});

test("periodosSobrepostos pega sobreposicao parcial e virada de ano", () => {
  const verao = { fromMonth: 6, fromDay: 14, toMonth: 8, toDay: 23 };
  assert.equal(periodosSobrepostos(verao, { fromMonth: 7, fromDay: 1, toMonth: 7, toDay: 31 }), true, "julho dentro do verao");
  assert.equal(periodosSobrepostos(verao, { fromMonth: 8, fromDay: 23, toMonth: 9, toDay: 30 }), true, "encosta num dia");
  assert.equal(periodosSobrepostos(verao, { fromMonth: 9, fromDay: 1, toMonth: 10, toDay: 31 }), false);
  const natal = { fromMonth: 12, fromDay: 15, toMonth: 1, toDay: 10 };
  assert.equal(periodosSobrepostos(natal, { fromMonth: 1, fromDay: 5, toMonth: 2, toDay: 28 }), true, "cruza o ano novo");
  assert.equal(periodosSobrepostos(natal, { fromMonth: 3, fromDay: 1, toMonth: 4, toDay: 30 }), false);
});
