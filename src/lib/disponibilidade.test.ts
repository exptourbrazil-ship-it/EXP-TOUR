// Testes dos helpers puros da Disponibilidade.
import { test } from "node:test";
import assert from "node:assert/strict";
import { validarIntake, validarPrograma, dataIsoValida } from "./disponibilidade.ts";

test("dataIsoValida aceita AAAA-MM-DD real e rejeita o resto", () => {
  assert.equal(dataIsoValida("2026-09-15"), true);
  assert.equal(dataIsoValida("2026-13-01"), false); // mes invalido
  assert.equal(dataIsoValida("2026-02-30"), false); // dia inexistente
  assert.equal(dataIsoValida("2026-9-1"), false); // sem zero-pad
  assert.equal(dataIsoValida(""), false);
  assert.equal(dataIsoValida(null), false);
});

test("validarIntake: normaliza status/capacity padrao", () => {
  const r = validarIntake({ startDate: "2026-09-15" });
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.dados, { startDate: "2026-09-15", status: "open", capacity: null, notes: null });
});

test("validarIntake: aceita status e capacidade explicitos + notes", () => {
  const r = validarIntake({ startDate: "2026-09-15", status: "limited", capacity: "8", notes: "  poucas vagas  " });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.dados.status, "limited");
    assert.equal(r.dados.capacity, 8);
    assert.equal(r.dados.notes, "poucas vagas");
  }
});

test("validarIntake: rejeita data, status e capacidade invalidos", () => {
  assert.equal(validarIntake({ startDate: "nope" }).ok, false);
  assert.equal(validarIntake({ startDate: "2026-09-15", status: "sold_out" }).ok, false);
  assert.equal(validarIntake({ startDate: "2026-09-15", capacity: "-1" }).ok, false);
  assert.equal(validarIntake({ startDate: "2026-09-15", capacity: "3.5" }).ok, false);
});

test("validarPrograma: exige nome; normaliza duracao e idioma", () => {
  const r = validarPrograma({ name: "  General English  ", language: "en", minDuration: "2", maxDuration: "52" });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.dados.name, "General English");
    assert.equal(r.dados.language, "en");
    assert.equal(r.dados.minDuration, 2);
    assert.equal(r.dados.maxDuration, 52);
  }
  assert.equal(validarPrograma({ name: "" }).ok, false);
});

test("validarPrograma: max < min e duracao nao-inteira sao rejeitados", () => {
  assert.equal(validarPrograma({ name: "X", minDuration: "10", maxDuration: "5" }).ok, false);
  assert.equal(validarPrograma({ name: "X", minDuration: "0" }).ok, false);
  assert.equal(validarPrograma({ name: "X", maxDuration: "2.5" }).ok, false);
});
