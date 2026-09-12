import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularReembolsoUnificado, type ReembolsoUnificadoInput } from "./reembolso-unificado.ts";

function base(over: Partial<ReembolsoUnificadoInput> = {}): ReembolsoUnificadoInput {
  return {
    moedaPrograma: "CAD",
    retencaoExpTour: 100,
    retencaoFornecedor: 200,
    cotacaoPtax: 4,
    iof: 0,
    spread: 0,
    totalPagoBRL: 2000,
    ...over,
  };
}

test("U1 soma componentes e converte para BRL (VET sem IOF/spread)", () => {
  const r = calcularReembolsoUnificado(base());
  assert.equal(r.totalRetidoMoeda, 300); // 100 + 200
  assert.equal(r.vet, 4);
  assert.equal(r.totalRetidoBRL, 1200); // 300 * 4
  assert.equal(r.reembolsoBRL, 800); // 2000 - 1200
  assert.equal(r.aindaDevidoBRL, 0);
});

test("U2 VET aplica IOF e spread", () => {
  const r = calcularReembolsoUnificado(base({ iof: 0.035, spread: 0.05 }));
  // 4 * 1.035 * 1.05 = 4.347
  assert.equal(r.vet, 4.35); // round2
  assert.equal(r.totalRetidoBRL, round2(300 * 4.35));
});

test("U3 não-recuperáveis e remuneração por serviços somam", () => {
  const r = calcularReembolsoUnificado(base({ naoRecuperaveis: 50, remuneracaoServicos: 25 }));
  assert.equal(r.totalRetidoMoeda, 375); // 100+200+50+25
});

test("U4 piso de proximidade <30d eleva a retenção EXP Tour", () => {
  // tuition 1000, <30 dias -> piso 5% = 50; retenção EXP Tour bruta 40 -> vira 50.
  const r = calcularReembolsoUnificado(base({ retencaoExpTour: 40, tuition: 1000, diasAteInicio: 10, retencaoFornecedor: 0 }));
  assert.equal(r.pisoProximidadeAplicado, true);
  assert.equal(r.retencaoExpTour, 50);
  assert.equal(r.totalRetidoMoeda, 50);
});

test("U5 piso NÃO se aplica fora da proximidade (>=30d)", () => {
  const r = calcularReembolsoUnificado(base({ retencaoExpTour: 40, tuition: 1000, diasAteInicio: 45, retencaoFornecedor: 0 }));
  assert.equal(r.pisoProximidadeAplicado, false);
  assert.equal(r.retencaoExpTour, 40);
});

test("U6 piso não REBAIXA quando a retenção já é maior que o piso", () => {
  const r = calcularReembolsoUnificado(base({ retencaoExpTour: 300, tuition: 1000, diasAteInicio: 5, retencaoFornecedor: 0 }));
  assert.equal(r.pisoProximidadeAplicado, false); // 300 > 50
  assert.equal(r.retencaoExpTour, 300);
});

test("U7 saldo ainda devido quando o retido supera o pago", () => {
  const r = calcularReembolsoUnificado(base({ totalPagoBRL: 500 })); // retido 1200 BRL
  assert.equal(r.reembolsoBRL, 0);
  assert.equal(r.aindaDevidoBRL, 700);
});

test("U8 memória traz componentes, câmbio e total em BRL", () => {
  const r = calcularReembolsoUnificado(base({ proximoDegrauEmISO: "2026-09-30T00:00:00Z" }));
  const rotulos = r.memoria.map((l) => l.rotulo);
  assert.ok(rotulos.some((x) => x.startsWith("Retenção EXP Tour")));
  assert.ok(rotulos.some((x) => x.startsWith("Retenção do fornecedor")));
  assert.ok(rotulos.some((x) => x.startsWith("Total retido (BRL)")));
  assert.ok(rotulos.some((x) => x.includes("A retenção aumenta em 2026-09-30")));
  // Reembolso positivo -> aparece a linha de reembolso, não a de saldo devido.
  assert.ok(rotulos.some((x) => x.startsWith("Reembolso ao cliente")));
});

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
