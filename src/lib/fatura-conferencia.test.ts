import { test } from "node:test";
import assert from "node:assert/strict";
import { conferirFatura, similaridadeNome } from "./fatura-conferencia.ts";
import { normalizarFaturaExtraida } from "./fatura-extract.ts";

const prev = { grossAmount: 5000, currency: "CAD", estudanteNome: "Maria Silva" };

test("C1 tudo bate -> conferida", () => {
  const v = conferirFatura({
    fatura: normalizarFaturaExtraida({ studentName: "Maria Silva", grossAmount: 5000, currency: "CAD" }),
    previsao: prev,
  });
  assert.equal(v.status, "conferida");
  assert.equal(v.divergencias.length, 0);
});

test("C2 valor dentro da tolerancia (2%) -> conferida", () => {
  const v = conferirFatura({
    fatura: normalizarFaturaExtraida({ studentName: "Maria Silva", grossAmount: 5090, currency: "CAD" }),
    previsao: prev,
  });
  assert.equal(v.status, "conferida");
});

test("C3 valor fora da tolerancia -> divergente (critica)", () => {
  const v = conferirFatura({
    fatura: normalizarFaturaExtraida({ studentName: "Maria Silva", grossAmount: 5200, currency: "CAD" }),
    previsao: prev,
  });
  assert.equal(v.status, "divergente");
  assert.ok(v.divergencias.some((d) => d.campo === "Valor bruto" && d.severidade === "critica"));
});

test("C4 moeda divergente -> divergente", () => {
  const v = conferirFatura({
    fatura: normalizarFaturaExtraida({ studentName: "Maria Silva", grossAmount: 5000, currency: "USD" }),
    previsao: prev,
  });
  assert.equal(v.status, "divergente");
  assert.ok(v.divergencias.some((d) => d.campo === "Moeda"));
});

test("C5 estudante trocado (Souza x Silva) -> divergente", () => {
  const v = conferirFatura({
    fatura: normalizarFaturaExtraida({ studentName: "Maria Souza", grossAmount: 5000, currency: "CAD" }),
    previsao: prev,
  });
  assert.equal(v.status, "divergente");
  assert.ok(v.divergencias.some((d) => d.campo === "Estudante"));
});

test("C6 nome com acento/ordem diferente ainda bate", () => {
  const v = conferirFatura({
    fatura: normalizarFaturaExtraida({ studentName: "SILVA, María", grossAmount: 5000, currency: "CAD" }),
    previsao: prev,
  });
  assert.equal(v.status, "conferida");
});

test("C7 fatura sem valor -> divergente (nao da para conferir)", () => {
  const v = conferirFatura({
    fatura: normalizarFaturaExtraida({ studentName: "Maria Silva", currency: "CAD" }),
    previsao: prev,
  });
  assert.equal(v.status, "divergente");
  assert.ok(v.divergencias.some((d) => d.campo === "Valor bruto" && d.fatura === "não extraído"));
});

test("C8 previsao sem valor esperado -> nao trava por valor (so o que der)", () => {
  const v = conferirFatura({
    fatura: normalizarFaturaExtraida({ studentName: "Maria Silva", grossAmount: 5000, currency: "CAD" }),
    previsao: { grossAmount: null, currency: "CAD", estudanteNome: "Maria Silva" },
  });
  assert.equal(v.status, "conferida");
});

test("C9 tolerancia customizada (0%) reprova qualquer diferenca", () => {
  const v = conferirFatura({
    fatura: normalizarFaturaExtraida({ studentName: "Maria Silva", grossAmount: 5000.5, currency: "CAD" }),
    previsao: prev,
    toleranciaValorPct: 0,
  });
  assert.equal(v.status, "divergente");
});

test("similaridadeNome: idas e vindas", () => {
  assert.equal(similaridadeNome("Jose Silva", "José da Silva"), 1);
  assert.equal(similaridadeNome("", "x"), 0);
});

// ── normalizarFaturaExtraida (puro) ─────────────────────────────────────────
test("N1 aceita aliases e limpa valor", () => {
  const f = normalizarFaturaExtraida({ student: "Ana", total: "1.234,50", moeda: "cad", date: "2026-10-01" });
  assert.equal(f.studentName, "Ana");
  assert.equal(f.grossAmount, 1234.5);
  assert.equal(f.currency, "CAD");
  assert.equal(f.issueDate, "2026-10-01");
});

test("N2 lixo vira null (nunca inventa)", () => {
  const f = normalizarFaturaExtraida({ grossAmount: "abc", currency: "dolar", issueDate: "2026-13-40" });
  assert.equal(f.grossAmount, null);
  assert.equal(f.currency, null);
  assert.equal(f.issueDate, null);
});
