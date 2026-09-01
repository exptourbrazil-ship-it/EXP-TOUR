// Testes da ponte Anexo I -> Acerto. Alimenta o mapper com resultados REAIS do
// motor do Anexo I (calcularReembolsoEscalonado), garantindo que os numeros do
// acerto (retencaoValor / saldo) sao exatamente os do escalonado.
import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularReembolsoEscalonado } from "./reembolso-anexo-i.ts";
import { montarAcertoDeReembolso } from "./acerto-anexo-i.ts";

// M1 — etapa LOA (3,5%) sem teto atingido: retencao = 3,5% do tuition.
test("M1 etapa LOA -> retencaoValor e saldo batem com o escalonado", () => {
  const resultado = calcularReembolsoEscalonado({
    moeda: "BRL",
    tuition: 10000,
    etapaChave: "loa",
    totalPago: 5000,
    teto: 100000, // teto alto: nao limita
  });
  const acerto = montarAcertoDeReembolso({ valorTotal: 10000, resultado });
  assert.equal(acerto.retencaoValor, 350); // 3,5% de 10000
  assert.equal(acerto.saldoDevolverCliente, 4650); // 5000 - 350
  assert.equal(acerto.retencaoPercentual, 0.035); // efetivo, 4 casas (sem distorcao)
  assert.equal(acerto.refundEscolaEsperado, 0);
});

// M2 — teto corta a retencao: o acerto herda o valor limitado.
test("M2 teto limita o total retido", () => {
  const resultado = calcularReembolsoEscalonado({
    moeda: "BRL",
    tuition: 100000,
    etapaChave: "visto_embarque", // 5% => 5000 bruto
    totalPago: 20000,
    teto: 800,
  });
  const acerto = montarAcertoDeReembolso({ valorTotal: 100000, resultado });
  assert.equal(acerto.retencaoValor, 800); // limitado ao teto
  assert.equal(acerto.saldoDevolverCliente, 19200); // 20000 - 800
  // memoria expoe o corte pelo teto.
  assert.ok(acerto.memoria.some((l) => /teto/i.test(l.rotulo)));
});

// M3 — dispensa (Anexo I.4, ex.: culpa da escola): sem retencao percentual.
test("M3 dispensa zera a retencao percentual", () => {
  const resultado = calcularReembolsoEscalonado({
    moeda: "BRL",
    tuition: 10000,
    etapaChave: "loa",
    totalPago: 5000,
    teto: 800,
    dispensaRetencao: true,
  });
  const acerto = montarAcertoDeReembolso({ valorTotal: 10000, resultado });
  assert.equal(acerto.retencaoValor, 0);
  assert.equal(acerto.saldoDevolverCliente, 5000);
  assert.ok(acerto.memoria.some((l) => /dispens/i.test(l.rotulo)));
});

// M4 — pagou menos que o retido: saldo a devolver nunca fica negativo.
test("M4 saldo a devolver nunca negativo", () => {
  const resultado = calcularReembolsoEscalonado({
    moeda: "BRL",
    tuition: 100000,
    etapaChave: "visto_embarque",
    totalPago: 300, // pagou menos que o teto (800)
    teto: 800,
  });
  const acerto = montarAcertoDeReembolso({ valorTotal: 100000, resultado });
  assert.equal(acerto.retencaoValor, 800);
  assert.equal(acerto.saldoDevolverCliente, 0); // max(0, 300 - 800)
});

// M5 — a memoria do acerto so tem valores em MOEDA (info/debito/credito). O Termo
// formata todo valor como moeda; um percentual entra no TEXTO do rotulo, nunca
// como valor de linha. Garante que nenhuma linha carregue uma fracao como valor.
test("M5 memoria sem linha de percentual (compat com o Termo)", () => {
  const resultado = calcularReembolsoEscalonado({
    moeda: "BRL",
    tuition: 10000,
    etapaChave: "entrada", // 2%
    totalPago: 5000,
  });
  const acerto = montarAcertoDeReembolso({ valorTotal: 10000, resultado });
  for (const l of acerto.memoria) {
    assert.ok(["info", "debito", "credito"].includes(l.tipo));
    // Nenhum valor deve ser uma fracao 0<v<1 (sinal de percentual vazado).
    assert.ok(!(l.valor > 0 && l.valor < 1), `linha com valor fracionario: ${l.rotulo}`);
  }
  // O percentual da etapa aparece no texto da linha de retencao.
  assert.ok(acerto.memoria.some((l) => l.rotulo.includes("2%")));
});

// M5b — caso simples (sem nao-recuperaveis, sem teto): uma UNICA linha de debito
// (a retencao), sem "Total retido" duplicando o mesmo valor no Termo.
test("M5b caso simples nao duplica a linha de retencao", () => {
  const resultado = calcularReembolsoEscalonado({
    moeda: "BRL",
    tuition: 10000,
    etapaChave: "loa",
    totalPago: 5000,
    teto: 100000, // nao corta
  });
  const acerto = montarAcertoDeReembolso({ valorTotal: 10000, resultado });
  const debitos = acerto.memoria.filter((l) => l.tipo === "debito");
  assert.equal(debitos.length, 1);
  assert.equal(debitos[0].valor, 350);
  assert.ok(!acerto.memoria.some((l) => l.rotulo === "Total retido"));
});

// M5c — com teto cortando, "Total retido" aparece (soma/limite informativo).
test("M5c com teto aparece Total retido", () => {
  const resultado = calcularReembolsoEscalonado({
    moeda: "BRL",
    tuition: 100000,
    etapaChave: "visto_embarque",
    totalPago: 20000,
    teto: 800,
  });
  const acerto = montarAcertoDeReembolso({ valorTotal: 100000, resultado });
  assert.ok(acerto.memoria.some((l) => l.rotulo === "Total retido" && l.valor === 800));
});

// M6 — refund esperado da escola e informacional e nao mexe no saldo do cliente.
test("M6 refund da escola nao altera o saldo do cliente", () => {
  const resultado = calcularReembolsoEscalonado({
    moeda: "BRL",
    tuition: 10000,
    etapaChave: "loa",
    totalPago: 5000,
    teto: 100000,
  });
  const acerto = montarAcertoDeReembolso({ valorTotal: 10000, resultado, refundEscolaEsperado: 1234.56 });
  assert.equal(acerto.refundEscolaEsperado, 1234.56);
  assert.equal(acerto.saldoDevolverCliente, 4650); // inalterado
});
