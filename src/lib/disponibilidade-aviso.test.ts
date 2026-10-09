// Testes dos avisos de disponibilidade da cotação (helpers puros).
import { test } from "node:test";
import assert from "node:assert/strict";
import { avisoDeIntake, avisoDePeriodo, somarDias } from "./disponibilidade-aviso.ts";

const intakes = [
  { startDate: "2027-01-04", status: "open" },
  { startDate: "2027-02-01", status: "open" },
  { startDate: "2027-07-06", status: "open" },
  { startDate: "2027-08-02", status: "open" },
];

test("intake: data cadastrada não gera aviso", () => {
  assert.deepEqual(avisoDeIntake("2027-02-01", intakes), []);
});

test("intake: sem lista cadastrada não avisa", () => {
  assert.deepEqual(avisoDeIntake("2027-03-01", []), []);
});

test("intake: data fora da lista avisa e sugere as próximas datas", () => {
  const r = avisoDeIntake("2027-03-01", intakes);
  assert.equal(r.length, 1);
  assert.match(r[0], /01\/03\/2027 não está entre as datas/);
  assert.match(r[0], /06\/07\/2027, 02\/08\/2027/);
  assert.doesNotMatch(r[0], /Warning bloqueante/);
});

test("intake: depois da última data avisa a última cadastrada", () => {
  const r = avisoDeIntake("2028-12-01", intakes);
  assert.match(r[0], /última data cadastrada é 02\/08\/2027/);
});

test("intake: turma encerrada, lista de espera e poucas vagas", () => {
  assert.match(avisoDeIntake("2027-01-04", [{ startDate: "2027-01-04", status: "closed" }])[0], /encerrada/);
  assert.match(avisoDeIntake("2027-01-04", [{ startDate: "2027-01-04", status: "waitlist" }])[0], /lista de espera/);
  assert.match(avisoDeIntake("2027-01-04", [{ startDate: "2027-01-04", status: "limited" }])[0], /poucas vagas/);
});

test("intake: datas encerradas não são sugeridas", () => {
  const r = avisoDeIntake("2027-03-01", [
    { startDate: "2027-03-22", status: "closed" },
    { startDate: "2027-06-16", status: "open" },
  ]);
  assert.match(r[0], /16\/06\/2027/);
  assert.doesNotMatch(r[0], /22\/03\/2027\./);
});

const maioAgosto = [{ periodStart: "2027-05-01", periodEnd: "2027-08-31", status: "open" }];

test("período: estadia dentro da janela não avisa", () => {
  assert.deepEqual(avisoDePeriodo("2027-06-01", somarDias("2027-06-01", 28), maioAgosto), []);
});

test("período: sem janelas cadastradas não avisa", () => {
  assert.deepEqual(avisoDePeriodo("2027-01-10", "2027-02-07", []), []);
});

test("período: início fora da janela avisa e lista os períodos", () => {
  const r = avisoDePeriodo("2027-01-10", "2027-02-07", maioAgosto);
  assert.match(r[0], /fora dos períodos/);
  assert.match(r[0], /01\/05\/2027 a 31\/08\/2027/);
});

test("período: começa dentro mas termina depois da janela avisa", () => {
  const r = avisoDePeriodo("2027-08-20", somarDias("2027-08-20", 28), maioAgosto);
  assert.equal(r.length, 1);
});

test("período: janela sem fim cobre qualquer término", () => {
  assert.deepEqual(avisoDePeriodo("2027-06-01", "2028-06-01", [{ periodStart: "2027-05-01", periodEnd: null, status: "open" }]), []);
});

test("período: sob consulta e fechado têm avisos próprios", () => {
  assert.match(avisoDePeriodo("2027-06-01", "2027-06-29", [{ periodStart: "2027-05-01", periodEnd: "2027-08-31", status: "on_request" }])[0], /sob consulta/);
  assert.match(avisoDePeriodo("2027-06-01", "2027-06-29", [{ periodStart: "2027-05-01", periodEnd: "2027-08-31", status: "closed" }])[0], /fechada/);
});

test("somarDias atravessa mês e ano", () => {
  assert.equal(somarDias("2026-12-30", 7), "2027-01-06");
});
