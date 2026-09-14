import { test } from "node:test";
import assert from "node:assert/strict";
import { montarResumoAlertaSLA, type EntradaAlertaSLA } from "./sla-alerta.ts";

const UM: EntradaAlertaSLA = {
  tipoLabel: "Documento pendente",
  titularNome: "Fulano de Tal",
  titularId: "t1",
  atrasoDiasUteis: 3,
};
const DOIS: EntradaAlertaSLA = {
  tipoLabel: "Confirmação de fornecedor",
  titularNome: "Beltrano",
  titularId: "t2",
  atrasoDiasUteis: 7,
};

test("sem estourados -> null (nao envia)", () => {
  assert.equal(montarResumoAlertaSLA({ estourados: [], venceHoje: 5, marca: "Forio" }), null);
});

test("assunto tem contagem e marca; corpo lista os casos", () => {
  const r = montarResumoAlertaSLA({ estourados: [UM], venceHoje: 0, marca: "Forio" });
  assert.ok(r);
  assert.equal(r!.assunto, "1 SLA(s) estourado(s) — Forio");
  assert.match(r!.texto, /Documento pendente — Fulano de Tal: 3 dias úteis de atraso/);
  // Sem "vence hoje" quando venceHoje = 0.
  assert.doesNotMatch(r!.texto, /vence\(m\) hoje/);
});

test("ordena por atraso desc e inclui contexto de vence-hoje", () => {
  const r = montarResumoAlertaSLA({ estourados: [UM, DOIS], venceHoje: 2, marca: "EXP Tour" });
  assert.ok(r);
  // O mais atrasado (7) vem antes do menos atrasado (3).
  const posDois = r!.texto.indexOf("Beltrano");
  const posUm = r!.texto.indexOf("Fulano");
  assert.ok(posDois < posUm, "o mais atrasado deve vir primeiro");
  assert.match(r!.texto, /Além disso, 2 vence\(m\) hoje\./);
});

test("atraso 0 dias uteis (recem-vencido) tem texto proprio", () => {
  const r = montarResumoAlertaSLA({
    estourados: [{ ...UM, atrasoDiasUteis: 0 }],
    venceHoje: 0,
    marca: "Forio",
  });
  assert.ok(r);
  assert.match(r!.texto, /prazo vencido \(0 dias úteis\)/);
  assert.doesNotMatch(r!.texto, /0 dias úteis de atraso/);
});

test("singular de dia util e link absoluto com appUrl", () => {
  const r = montarResumoAlertaSLA({
    estourados: [{ ...UM, atrasoDiasUteis: 1 }],
    venceHoje: 0,
    marca: "Forio",
    appUrl: "https://forio.example.com/",
  });
  assert.ok(r);
  assert.match(r!.texto, /1 dia útil de atraso/);
  assert.match(r!.texto, /https:\/\/forio\.example\.com\/admin\/sla/);
});
