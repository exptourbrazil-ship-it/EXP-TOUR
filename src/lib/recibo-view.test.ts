import { test } from "node:test";
import assert from "node:assert/strict";
import { montarReciboView, brl, moe, pct, ptaxFmt, type ReciboViewInput } from "./recibo-view.ts";

function base(): ReciboViewInput {
  return {
    descricao: "Parcela 2/4",
    dataFormatada: "30/08/2026 14:20",
    moeda: "CAD",
    semCambio: false,
    ptax: 4.0,
    subtotal: 4000,
    taxaPercentual: 0.05,
    taxaIntermediacao: 200,
    iofPercentual: 0.035,
    iof: 140,
    totalBRL: 4340,
    amortizacaoMoeda: 1000,
    saldoRestanteMoeda: 3000,
    legado: false,
  };
}

// R1 — recibo completo com as 7 linhas itemizadas na ordem do contrato.
test("R1 linhas itemizadas", () => {
  const r = montarReciboView(base());
  const rot = r.linhas.map((l) => l.rotulo);
  assert.deepEqual(rot, [
    "PTAX de venda (BCB) aplicada",
    "Valor convertido",
    "Taxa de Intermediação e Câmbio (5%)",
    "IOF-câmbio (3,5%)",
    "Total pago",
    "Valor amortizado",
    "Saldo devedor remanescente",
  ]);
  const map = Object.fromEntries(r.linhas.map((l) => [l.rotulo, l.valor]));
  assert.equal(map["Valor convertido"], "R$ 4.000,00");
  assert.equal(map["Total pago"], "R$ 4.340,00");
  assert.equal(map["Valor amortizado"], "CAD 1.000,00");
  assert.equal(map["Saldo devedor remanescente"], "CAD 3.000,00");
});

// R2 — total pago é a linha em destaque.
test("R2 destaque no total", () => {
  const r = montarReciboView(base());
  const total = r.linhas.find((l) => l.rotulo === "Total pago")!;
  assert.equal(total.destaque, true);
});

// R3 — nota 6.5.2.1: sem tarifa de remessa separada.
test("R3 nota sem tarifa", () => {
  const r = montarReciboView(base());
  assert.ok(r.nota.includes("Nenhuma tarifa"));
});

// R4 — saldo null omite a linha de saldo.
test("R4 saldo indisponivel", () => {
  const i = base();
  i.saldoRestanteMoeda = null;
  const r = montarReciboView(i);
  assert.ok(!r.linhas.some((l) => l.rotulo === "Saldo devedor remanescente"));
});

// R5 — semCambio: recibo simplificado (sem PTAX/taxa/IOF), nota propria.
test("R5 sem cambio (BRL)", () => {
  const i = base();
  i.semCambio = true;
  i.moeda = "BRL";
  const r = montarReciboView(i);
  const rot = r.linhas.map((l) => l.rotulo);
  assert.deepEqual(rot, ["Total pago", "Valor amortizado", "Saldo devedor remanescente"]);
  assert.ok(r.nota.includes("sem conversão"));
});

// R6 — cobranca legada emite aviso; padrao nao.
test("R6 aviso legado", () => {
  const i = base();
  i.legado = true;
  i.taxaPercentual = 0.066;
  const r = montarReciboView(i);
  assert.ok(r.avisoLegado && r.avisoLegado.includes("congelados"));
  assert.equal(r.linhas.find((l) => l.rotulo.startsWith("Taxa"))!.rotulo, "Taxa de Intermediação e Câmbio (6,6%)");
  assert.equal(montarReciboView(base()).avisoLegado, null);
});

// R7 — formatadores deterministicos.
test("R7 formatadores", () => {
  assert.equal(brl(1234.5), "R$ 1.234,50");
  assert.equal(moe(1000000, "usd"), "USD 1.000.000,00");
  assert.equal(pct(0.05), "5%");
  assert.equal(pct(0.035), "3,5%");
  assert.equal(ptaxFmt(4), "R$ 4,0000"); // minimo 4 casas
  assert.equal(ptaxFmt(4.436), "R$ 4,4360"); // 4 casas (apara so o excedente > 4)
  assert.equal(ptaxFmt(4.436512), "R$ 4,436512"); // ate 6 casas
});
