import { test } from "node:test";
import assert from "node:assert/strict";
import { conferirFaturas, similaridadeNome, type LadoFatura } from "./fatura-conferencia.ts";
import { normalizarFaturaExtraida } from "./fatura-extract.ts";

const prev = { grossAmount: 5000, currency: "CAD", estudanteNome: "Maria Silva" };
const grossOk: LadoFatura = { amount: 5000, currency: "CAD", studentName: "Maria Silva" };
const netOk: LadoFatura = { amount: 4250, currency: "CAD", studentName: "Maria Silva" };

test("C1 gross+net batem -> conferida, comissao=gross-net, remeter=net", () => {
  const v = conferirFaturas({ gross: grossOk, net: netOk, previsao: prev });
  assert.equal(v.status, "conferida");
  assert.equal(v.commission, 750);
  assert.equal(v.remeter, 4250);
});

test("C2 gross dentro da tolerancia (2%) -> conferida", () => {
  const v = conferirFaturas({ gross: { amount: 5090, currency: "CAD", studentName: "Maria Silva" }, net: netOk, previsao: prev });
  assert.equal(v.status, "conferida");
});

test("C3 gross fora da tolerancia -> divergente", () => {
  const v = conferirFaturas({ gross: { amount: 5200, currency: "CAD", studentName: "Maria Silva" }, net: netOk, previsao: prev });
  assert.equal(v.status, "divergente");
  assert.ok(v.divergencias.some((d) => d.campo === "Valor gross"));
});

test("C4 net maior que gross -> divergente (comissao negativa)", () => {
  const v = conferirFaturas({ gross: grossOk, net: { amount: 5300, currency: "CAD" }, previsao: prev });
  assert.equal(v.status, "divergente");
  assert.ok(v.divergencias.some((d) => d.campo === "Net vs gross"));
  assert.equal(v.commission, null); // net > gross -> nao calcula comissao
});

test("C5 moeda divergente entre gross e net -> divergente", () => {
  const v = conferirFaturas({ gross: grossOk, net: { amount: 4250, currency: "USD" }, previsao: prev });
  assert.equal(v.status, "divergente");
  assert.ok(v.divergencias.some((d) => d.campo === "Moeda"));
});

test("C6 falta a fatura net -> indeterminado (mas remeter/comissao null)", () => {
  const v = conferirFaturas({ gross: grossOk, net: null, previsao: prev });
  assert.equal(v.status, "indeterminado");
  assert.equal(v.remeter, null);
  assert.ok(v.divergencias.some((d) => d.campo === "Fatura net"));
});

test("C7 falta a fatura gross -> indeterminado", () => {
  const v = conferirFaturas({ gross: null, net: netOk, previsao: prev });
  assert.equal(v.status, "indeterminado");
  assert.equal(v.remeter, 4250); // remeter e o net (mesmo sem gross para conferir)
});

test("C8 estudante trocado (Souza x Silva) -> divergente", () => {
  const v = conferirFaturas({ gross: { amount: 5000, currency: "CAD", studentName: "Maria Souza" }, net: netOk, previsao: prev });
  assert.equal(v.status, "divergente");
  assert.ok(v.divergencias.some((d) => d.campo === "Estudante"));
});

test("C9 nome com acento/ordem ainda bate", () => {
  const v = conferirFaturas({ gross: { amount: 5000, currency: "CAD", studentName: "SILVA, María" }, net: netOk, previsao: prev });
  assert.equal(v.status, "conferida");
});

test("C10 contrato sem valor esperado -> indeterminado (gross nao verificavel)", () => {
  const v = conferirFaturas({ gross: grossOk, net: netOk, previsao: { grossAmount: null, currency: "CAD", estudanteNome: "Maria Silva" } });
  assert.equal(v.status, "indeterminado");
  assert.equal(v.commission, 750); // comissao ainda sai das faturas
});

test("C11 comissao zero (net = gross) e permitida", () => {
  const v = conferirFaturas({ gross: grossOk, net: { amount: 5000, currency: "CAD", studentName: "Maria Silva" }, previsao: prev });
  assert.equal(v.status, "conferida");
  assert.equal(v.commission, 0);
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
