import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ehFimDeSemana,
  ehDiaUtil,
  proximoDiaUtil,
  anteriorDiaUtil,
  somarDiasUteis,
  contarDiasUteis,
} from "./dias-uteis.ts";

// Referência de calendário (2026): 2026-09-04 é sexta, 05 sábado, 06 domingo,
// 07 segunda. 2026-09-07 (Independência) usado como feriado nos testes.
const FER = new Set<string>(["2026-09-07"]);

test("ehFimDeSemana identifica sábado e domingo", () => {
  assert.equal(ehFimDeSemana("2026-09-05"), true); // sábado
  assert.equal(ehFimDeSemana("2026-09-06"), true); // domingo
  assert.equal(ehFimDeSemana("2026-09-04"), false); // sexta
  assert.equal(ehFimDeSemana("2026-09-08"), false); // terça
});

test("ehDiaUtil: fim de semana e feriado não são úteis", () => {
  assert.equal(ehDiaUtil("2026-09-04"), true); // sexta
  assert.equal(ehDiaUtil("2026-09-05"), false); // sábado
  assert.equal(ehDiaUtil("2026-09-07"), true); // segunda, sem feriados
  assert.equal(ehDiaUtil("2026-09-07", FER), false); // segunda feriado
});

test("proximoDiaUtil pula fim de semana e feriado", () => {
  // Sexta útil -> ela mesma.
  assert.equal(proximoDiaUtil("2026-09-04"), "2026-09-04");
  // Sábado -> segunda 07; com feriado na 07 -> terça 08.
  assert.equal(proximoDiaUtil("2026-09-05"), "2026-09-07");
  assert.equal(proximoDiaUtil("2026-09-05", FER), "2026-09-08");
});

test("anteriorDiaUtil recua para trás", () => {
  assert.equal(anteriorDiaUtil("2026-09-06"), "2026-09-04"); // domingo -> sexta
  assert.equal(anteriorDiaUtil("2026-09-07", FER), "2026-09-04"); // seg feriado -> sexta
  assert.equal(anteriorDiaUtil("2026-09-04"), "2026-09-04"); // sexta -> ela mesma
});

test("somarDiasUteis avança pulando fds/feriado", () => {
  // Sexta 04 + 1 dia útil = segunda 07 (sem feriado).
  assert.equal(somarDiasUteis("2026-09-04", 1), "2026-09-07");
  // Sexta 04 + 1 dia útil, com feriado na 07 = terça 08.
  assert.equal(somarDiasUteis("2026-09-04", 1, FER), "2026-09-08");
  // 5 dias úteis a partir de sexta 04 = sexta 11 (sem feriado).
  assert.equal(somarDiasUteis("2026-09-04", 5), "2026-09-11");
  // n = 0 devolve a própria data (mesmo se fim de semana).
  assert.equal(somarDiasUteis("2026-09-05", 0), "2026-09-05");
});

test("somarDiasUteis com n negativo recua", () => {
  // Segunda 07 - 1 dia útil = sexta 04.
  assert.equal(somarDiasUteis("2026-09-07", -1), "2026-09-04");
});

test("contarDiasUteis conta o intervalo inclusivo", () => {
  // 04(sex) a 11(sex): 04,07,08,09,10,11 = 6 úteis (sem feriado).
  assert.equal(contarDiasUteis("2026-09-04", "2026-09-11"), 6);
  // Mesmo intervalo com feriado na 07 -> 5.
  assert.equal(contarDiasUteis("2026-09-04", "2026-09-11", FER), 5);
  // Só fim de semana -> 0.
  assert.equal(contarDiasUteis("2026-09-05", "2026-09-06"), 0);
  // ate < de -> 0.
  assert.equal(contarDiasUteis("2026-09-11", "2026-09-04"), 0);
});
