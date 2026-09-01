import { test } from "node:test";
import assert from "node:assert/strict";
import {
  idadeEmAnos,
  signatariosNecessarios,
  fichaCompleta,
  papeisPendentes,
} from "./ficha-matricula.ts";

// F1 — idade em anos completos (antes/depois do aniversario).
test("F1 idade", () => {
  assert.equal(idadeEmAnos("2008-06-15", "2026-06-14"), 17); // vespera do aniversario
  assert.equal(idadeEmAnos("2008-06-15", "2026-06-15"), 18); // no aniversario
  assert.equal(idadeEmAnos("2000-01-01", "2026-09-01"), 26);
  assert.equal(idadeEmAnos(null, "2026-09-01"), null);
  assert.equal(idadeEmAnos("x", "2026-09-01"), null);
});

// F2 — adulto: so o participante assina.
test("F2 adulto", () => {
  const s = signatariosNecessarios({ nascimentoISO: "2000-01-01", hojeISO: "2026-09-01" });
  assert.equal(s.menor, false);
  assert.deepEqual(s.papeis, ["participante"]);
});

// F3 — menor: participante + responsavel (multi-signatario).
test("F3 menor", () => {
  const s = signatariosNecessarios({ nascimentoISO: "2012-05-10", hojeISO: "2026-09-01" }); // 14 anos
  assert.equal(s.menor, true);
  assert.deepEqual(s.papeis, ["participante", "responsavel"]);
});

// F4 — sem data de nascimento: conservador (trata como menor).
test("F4 sem nascimento", () => {
  const s = signatariosNecessarios({ nascimentoISO: null, hojeISO: "2026-09-01" });
  assert.equal(s.menor, true);
  assert.ok(s.papeis.includes("responsavel"));
});

// F5 — maioridade configuravel.
test("F5 maioridade configuravel", () => {
  const s = signatariosNecessarios({ nascimentoISO: "2005-01-01", hojeISO: "2026-09-01", maioridade: 21 }); // 21 anos -> adulto no default 18, mas menor se 21? tem 21 -> nao menor
  assert.equal(s.menor, false);
  const s2 = signatariosNecessarios({ nascimentoISO: "2007-01-01", hojeISO: "2026-09-01", maioridade: 21 }); // 19 anos -> menor se maioridade 21
  assert.equal(s2.menor, true);
});

// F6 — completude e pendencias.
test("F6 completude", () => {
  const nec = ["participante", "responsavel"] as const;
  assert.equal(fichaCompleta(["participante"], [...nec]), false);
  assert.deepEqual(papeisPendentes(["participante"], [...nec]), ["responsavel"]);
  assert.equal(fichaCompleta(["participante", "responsavel"], [...nec]), true);
  assert.deepEqual(papeisPendentes(["participante", "responsavel"], [...nec]), []);
  assert.equal(fichaCompleta(["participante"], ["participante"]), true);
});
