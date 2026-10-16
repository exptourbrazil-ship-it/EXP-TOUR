// Testes do motor puro de contas a receber de comissao.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calcularComissaoFatura,
  validarNovaFatura,
  statusExibicao,
  saldoFatura,
  vencimentoPadrao,
  lembreteDevido,
  normalizarEmissor,
  somarDiasISO,
  diferencaDias,
} from "./comissao-fatura.ts";

const SUP = "11111111-1111-4111-8111-111111111111";
const CTR = "22222222-2222-4222-8222-222222222222";

test("percentual incide sobre a base informada", () => {
  assert.equal(calcularComissaoFatura({ base: 4000, currency: "CAD", type: "percent", value: 20 }), 800);
  assert.equal(calcularComissaoFatura({ base: 1234.56, currency: "USD", type: "percent", value: 15 }), 185.18);
});

test("fixo por venda e por semana; por semana exige semanas", () => {
  assert.equal(calcularComissaoFatura({ base: 5000, currency: "GBP", type: "fixed_per_sale", value: 300 }), 300);
  assert.equal(calcularComissaoFatura({ base: 5000, currency: "GBP", type: "fixed_per_week", value: 40, weeks: 12 }), 480);
  assert.equal(calcularComissaoFatura({ base: 5000, currency: "GBP", type: "fixed_per_week", value: 40 }), null);
});

test("valor fixo em moeda diferente nao e convertido: devolve null", () => {
  assert.equal(calcularComissaoFatura({ base: 5000, currency: "GBP", type: "fixed_per_sale", value: 300, acordoCurrency: "CAD" }), null);
});

test("comissao nunca excede a base", () => {
  assert.equal(calcularComissaoFatura({ base: 200, currency: "USD", type: "fixed_per_sale", value: 900 }), 200);
  assert.equal(calcularComissaoFatura({ base: 1000, currency: "USD", type: "percent", value: 250 }), 1000);
});

test("validar: entrada completa pelo acordo", () => {
  const r = validarNovaFatura({
    supplierId: SUP, contratoId: CTR, currency: "cad", studentName: "  Ana Souza ", programName: "General English 25",
    startDate: "2027-03-01", endDate: "2027-05-21", weeks: 12, paidToSchoolAmount: "4.800,00".replace(".", "").replace(",", "."),
    paidToSchoolAt: "2026-12-10", commissionType: "percent", commissionValue: 20,
  });
  assert.ok(r.ok);
  assert.equal(r.valor.currency, "CAD");
  assert.equal(r.valor.commissionAmount, 960);
  assert.equal(r.valor.studentName, "Ana Souza");
});

test("validar: ajuste manual vence o calculado", () => {
  const r = validarNovaFatura({ supplierId: SUP, currency: "USD", paidToSchoolAmount: 3000, commissionType: "percent", commissionValue: 20, commissionAmount: 500 });
  assert.ok(r.ok);
  assert.equal(r.valor.commissionAmount, 500);
});

test("validar: sem como calcular exige a comissao digitada", () => {
  const r = validarNovaFatura({ supplierId: SUP, currency: "USD", paidToSchoolAmount: 3000 });
  assert.equal(r.ok, false);
});

test("validar: recusa escola/caso/moeda/valores/datas invalidos", () => {
  const base = { supplierId: SUP, currency: "USD", paidToSchoolAmount: 3000, commissionAmount: 300 };
  assert.equal(validarNovaFatura({ ...base, supplierId: "x" }).ok, false);
  assert.equal(validarNovaFatura({ ...base, contratoId: "x" }).ok, false);
  assert.equal(validarNovaFatura({ ...base, currency: "DOLAR" }).ok, false);
  assert.equal(validarNovaFatura({ ...base, paidToSchoolAmount: 0 }).ok, false);
  assert.equal(validarNovaFatura({ ...base, commissionAmount: 0 }).ok, false);
  assert.equal(validarNovaFatura({ ...base, commissionAmount: 3500 }).ok, false);
  assert.equal(validarNovaFatura({ ...base, startDate: "2027-02-31" }).ok, false);
  assert.equal(validarNovaFatura({ ...base, startDate: "2027-05-01", endDate: "2027-04-01" }).ok, false);
  assert.equal(validarNovaFatura({ ...base, commissionType: "xx" }).ok, false);
});

test("saldo e estado exibido (parcial e vencida sao derivados)", () => {
  const f = { status: "enviada" as const, due_date: "2027-01-10", commission_amount: 1000, received_amount: 0 };
  assert.equal(saldoFatura(f), 1000);
  assert.deepEqual(statusExibicao(f, "2027-01-05"), { status: "enviada", diasAtraso: 0 });
  assert.deepEqual(statusExibicao(f, "2027-01-10"), { status: "enviada", diasAtraso: 0 });
  assert.deepEqual(statusExibicao(f, "2027-01-15"), { status: "vencida", diasAtraso: 5 });
  assert.deepEqual(statusExibicao({ ...f, received_amount: 400 }, "2027-01-05"), { status: "parcial", diasAtraso: 0 });
  assert.equal(saldoFatura({ ...f, received_amount: 400 }), 600);
  assert.equal(statusExibicao({ ...f, status: "paga", received_amount: 1000 }, "2028-01-01").status, "paga");
  assert.equal(statusExibicao({ ...f, status: "cancelada" }, "2028-01-01").status, "cancelada");
  assert.equal(statusExibicao({ ...f, status: "rascunho" }, "2028-01-01").status, "rascunho");
});

test("vencimento padrao: emissao + prazo (30 por padrao)", () => {
  assert.equal(vencimentoPadrao("2027-01-01", null), "2027-01-31");
  assert.equal(vencimentoPadrao("2027-01-01", 45), "2027-02-15");
  assert.equal(vencimentoPadrao("2026-12-20", 30), "2027-01-19");
  assert.equal(somarDiasISO("2027-02-31", 1), null);
  assert.equal(diferencaDias("2027-01-01", "2027-01-11"), 10);
});

test("lembretes: marco alcancado (catch-up) e so com saldo", () => {
  const f = { status: "enviada" as const, due_date: "2027-02-10", commission_amount: 500, received_amount: 0 };
  assert.equal(lembreteDevido(f, "2027-02-06"), null); // faltam 4 dias: ainda cedo
  assert.equal(lembreteDevido(f, "2027-02-07"), "a_vencer");
  assert.equal(lembreteDevido(f, "2027-02-09"), "a_vencer"); // dia perdido continua devido
  assert.equal(lembreteDevido(f, "2027-02-10"), "vence_hoje");
  assert.equal(lembreteDevido(f, "2027-02-11"), "vencida_1");
  assert.equal(lembreteDevido(f, "2027-02-20"), "vencida_1");
  assert.equal(lembreteDevido(f, "2027-02-25"), "vencida_15");
  assert.equal(lembreteDevido(f, "2027-03-12"), "vencida_30");
  assert.equal(lembreteDevido(f, "2027-06-01"), "vencida_30");
  assert.equal(lembreteDevido({ ...f, status: "paga", received_amount: 500 }, "2027-02-10"), null);
  assert.equal(lembreteDevido({ ...f, status: "rascunho" }, "2027-02-10"), null);
  assert.equal(lembreteDevido({ ...f, status: "cancelada" }, "2027-02-10"), null);
});

test("emissor: exige razao social, e-mail e instrucoes de pagamento", () => {
  assert.equal(normalizarEmissor({}).ok, false);
  assert.equal(normalizarEmissor({ legalName: "EXP Tour LTDA", email: "x", paymentInstructions: "Banco" }).ok, false);
  const r = normalizarEmissor({ legalName: "EXP Tour LTDA", email: "fin@exp-tour.com", paymentInstructions: "Bank X, SWIFT Y", paymentTermsDays: "45", address: "Rua A" });
  assert.ok(r.ok);
  assert.equal(r.valor.paymentTermsDays, 45);
  assert.equal(normalizarEmissor({ legalName: "A", email: "a@b.co", paymentInstructions: "x", paymentTermsDays: 999 }).ok, false);
});

test("fatura com itens: cada linha usa a sua regra e o total e a soma", () => {
  const r = validarNovaFatura({
    supplierId: SUP, currency: "EUR",
    itens: [
      { kind: "program", description: "General English 20", baseAmount: 3000, commissionType: "percent", commissionValue: 25, commissionBasis: "tuition", ruleSource: "padrao" },
      { kind: "accommodation", description: "Residência Superior", baseAmount: 1200, commissionType: "percent", commissionValue: 10, commissionBasis: "tuition", ruleSource: "tipo" },
      { kind: "fee", description: "Matrícula", baseAmount: 55, commissionBasis: "none", ruleSource: "tipo" },
    ],
  });
  assert.ok(r.ok);
  assert.equal(r.valor.itens.length, 3);
  assert.deepEqual(r.valor.itens.map((i) => i.commissionAmount), [750, 120, 0]);
  assert.equal(r.valor.paidToSchoolAmount, 4255);
  assert.equal(r.valor.commissionAmount, 870);
  assert.equal(r.valor.itens[2].ruleSource, "tipo");
});

test("fatura com itens: ajuste manual por linha vence e marca origem manual", () => {
  const r = validarNovaFatura({
    supplierId: SUP, currency: "USD",
    itens: [{ kind: "program", description: "Curso", baseAmount: 1000, commissionType: "percent", commissionValue: 20, commissionAmount: 150, ruleSource: "padrao" }],
  });
  assert.ok(r.ok);
  assert.equal(r.valor.itens[0].commissionAmount, 150);
  assert.equal(r.valor.itens[0].ruleSource, "manual");
});

test("fatura com itens: recusa item sem descricao, sem base, sem regra ou acima da base", () => {
  const base = { supplierId: SUP, currency: "USD" };
  assert.equal(validarNovaFatura({ ...base, itens: [{ baseAmount: 100, commissionAmount: 10 }] }).ok, false);
  assert.equal(validarNovaFatura({ ...base, itens: [{ description: "x", baseAmount: 0, commissionAmount: 10 }] }).ok, false);
  assert.equal(validarNovaFatura({ ...base, itens: [{ description: "x", baseAmount: 100 }] }).ok, false);
  assert.equal(validarNovaFatura({ ...base, itens: [{ description: "x", baseAmount: 100, commissionAmount: 150 }] }).ok, false);
  assert.equal(validarNovaFatura({ ...base, itens: [{ description: "x", kind: "zz", baseAmount: 100, commissionAmount: 10 }] }).ok, false);
  assert.equal(validarNovaFatura({ ...base, itens: [] }).ok, false);
  assert.equal(validarNovaFatura({ ...base, itens: Array.from({ length: 21 }, () => ({ description: "x", baseAmount: 10, commissionAmount: 1 })) }).ok, false);
});

test("fatura com itens: total sem comissao nenhuma e recusado", () => {
  const r = validarNovaFatura({ supplierId: SUP, currency: "USD", itens: [{ kind: "fee", description: "Taxa", baseAmount: 50, commissionBasis: "none" }] });
  assert.equal(r.ok, false);
});

test("fatura com itens: fixo em moeda diferente da fatura exige comissao manual", () => {
  const r = validarNovaFatura({
    supplierId: SUP, currency: "CAD",
    itens: [{ kind: "program", description: "Curso", baseAmount: 3000, commissionType: "fixed_per_sale", commissionValue: 300, commissionCurrency: "USD", ruleSource: "padrao" }],
  });
  assert.equal(r.ok, false);
});

test("fatura com itens: fixo por venda vale uma vez por fatura", () => {
  const r = validarNovaFatura({
    supplierId: SUP, currency: "USD",
    itens: [
      { kind: "program", description: "Curso", baseAmount: 3000, commissionType: "fixed_per_sale", commissionValue: 300, commissionCurrency: "USD" },
      { kind: "accommodation", description: "Casa", baseAmount: 1000, commissionType: "fixed_per_sale", commissionValue: 300, commissionCurrency: "USD" },
    ],
  });
  assert.ok(r.ok);
  assert.deepEqual(r.valor.itens.map((i) => i.commissionAmount), [300, 0]);
  assert.equal(r.valor.commissionAmount, 300);
});
