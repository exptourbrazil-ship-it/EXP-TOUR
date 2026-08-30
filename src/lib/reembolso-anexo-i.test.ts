import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calcularReembolsoEscalonado,
  ETAPAS_ANEXO_I_PADRAO,
  TETO_RETENCAO_PADRAO,
  type ReembolsoInput,
} from "./reembolso-anexo-i.ts";

function base(): ReembolsoInput {
  return {
    moeda: "CAD",
    tuition: 10000,
    etapaChave: "entrada", // 2%
    totalPago: 3000,
    naoRecuperaveis: 300,
    // teto/etapas: defaults
  };
}

// A1 — retencao percentual por etapa + nao recuperaveis -> reembolso.
test("A1 retencao por etapa + nao recuperaveis", () => {
  const r = calcularReembolsoEscalonado(base());
  assert.equal(r.retencaoPercentual, 0.02);
  assert.equal(r.retencaoBruta, 200); // 2% de 10000
  assert.equal(r.naoRecuperaveis, 300);
  assert.equal(r.subtotalRetido, 500);
  assert.equal(r.totalRetido, 500); // abaixo do teto
  assert.equal(r.reembolso, 2500); // 3000 - 500
  assert.equal(r.aindaDevido, 0);
});

// A2 — teto limita o TOTAL retido (tuition alto).
test("A2 teto sobre o total", () => {
  const i = base();
  i.tuition = 100000; // 5% seria 5000; etapa visto_embarque
  i.etapaChave = "visto_embarque"; // 5%
  i.naoRecuperaveis = 0;
  i.totalPago = 100000;
  const r = calcularReembolsoEscalonado(i);
  assert.equal(r.retencaoBruta, 5000);
  assert.equal(r.subtotalRetido, 5000);
  assert.equal(r.tetoAtingido, true);
  assert.equal(r.totalRetido, TETO_RETENCAO_PADRAO); // 800
});

// A2b — os NAO RECUPERAVEIS entram no teto: retencao + nao recuperaveis > 800 -> 800.
test("A2b nao recuperaveis dentro do teto", () => {
  const i = base();
  i.tuition = 10000; // 2% = 200
  i.etapaChave = "entrada";
  i.naoRecuperaveis = 700; // subtotal 900
  i.totalPago = 5000;
  const r = calcularReembolsoEscalonado(i);
  assert.equal(r.subtotalRetido, 900);
  assert.equal(r.tetoAtingido, true);
  assert.equal(r.totalRetido, 800); // 200 + 700 limitado a 800
  assert.equal(r.reembolso, 4200); // 5000 - 800
});

// A3 — dispensa I.4 zera a retencao percentual (mantem nao recuperaveis, sob teto).
test("A3 dispensa I.4", () => {
  const i = base();
  i.dispensaRetencao = true;
  const r = calcularReembolsoEscalonado(i);
  assert.equal(r.dispensada, true);
  assert.equal(r.retencaoBruta, 0);
  assert.equal(r.totalRetido, 300); // so os nao recuperaveis (< teto)
  assert.equal(r.reembolso, 2700);
});

// A4 — etapa nula: sem retencao percentual.
test("A4 sem etapa", () => {
  const i = base();
  i.etapaChave = null;
  i.naoRecuperaveis = 0;
  const r = calcularReembolsoEscalonado(i);
  assert.equal(r.etapa, null);
  assert.equal(r.retencaoBruta, 0);
  assert.equal(r.totalRetido, 0);
  assert.equal(r.reembolso, 3000);
});

// A5 — pagou menos que o retido: saldo ainda devido, reembolso 0.
test("A5 ainda devido", () => {
  const i = base();
  i.etapaChave = "visto_embarque"; // 5% de 10000 = 500
  i.naoRecuperaveis = 300; // total retido 800
  i.totalPago = 500;
  const r = calcularReembolsoEscalonado(i);
  assert.equal(r.totalRetido, 800);
  assert.equal(r.reembolso, 0);
  assert.equal(r.aindaDevido, 300); // 800 - 500
});

// A6 — memoria de calculo tem as linhas e fecha no reembolso.
test("A6 memoria de calculo", () => {
  const r = calcularReembolsoEscalonado(base());
  const rots = r.memoria.map((l) => l.rotulo);
  assert.ok(rots.includes("Base de cálculo (tuition)"));
  assert.ok(rots.some((x) => x.startsWith("Retenção da etapa")));
  assert.ok(rots.includes("Total retido"));
  assert.equal(r.memoria[r.memoria.length - 1].rotulo, "Reembolso ao cliente");
  assert.equal(r.memoria[r.memoria.length - 1].valor, 2500);
});

// A7 — escalonamento padrao: percentuais 1/2/3,5/5%.
test("A7 escalonamento padrao", () => {
  assert.deepEqual(
    ETAPAS_ANEXO_I_PADRAO.map((e) => e.percentual),
    [0.01, 0.02, 0.035, 0.05],
  );
});

// A8 — etapas por config (override) tem precedencia sobre o default.
test("A8 config de etapas", () => {
  const i = base();
  i.etapas = [{ chave: "unica", rotulo: "Etapa única", percentual: 0.1 }];
  i.etapaChave = "unica";
  i.naoRecuperaveis = 0;
  i.teto = 100000; // nao limita
  const r = calcularReembolsoEscalonado(i);
  assert.equal(r.totalRetido, 1000); // 10% de 10000
});
