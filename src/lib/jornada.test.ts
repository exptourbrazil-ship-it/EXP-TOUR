// Testes do helper puro da jornada (aba Início).
import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularJornada, indiceEtapaAtual, totalConcluidas } from "./jornada.ts";

test("cliente novo: só o contrato concluído, documentos em andamento", () => {
  const j = calcularJornada({
    temContrato: true,
    documentosEnviados: 0,
    parcelasPagas: 0,
    parcelasTotal: 12,
    diasAteInicio: 120,
  });
  assert.equal(j[0].estado, "concluida"); // Contrato
  assert.equal(j[1].estado, "andamento"); // Documentos (começou, nada enviado)
  assert.equal(j[2].estado, "pendente"); // Pagamentos (nenhuma paga)
  assert.equal(totalConcluidas(j), 1);
  assert.equal(indiceEtapaAtual(j), 1);
});

test("pagamentos em andamento quando há parcelas pagas mas não todas", () => {
  const j = calcularJornada({
    temContrato: true,
    documentosEnviados: 3,
    parcelasPagas: 5,
    parcelasTotal: 12,
    diasAteInicio: 60,
  });
  assert.equal(j[1].estado, "concluida"); // Documentos
  assert.equal(j[2].estado, "andamento"); // Pagamentos parciais
});

test("pré-embarque em andamento quando faltam <= 30 dias", () => {
  const j = calcularJornada({
    temContrato: true,
    documentosEnviados: 3,
    parcelasPagas: 12,
    parcelasTotal: 12,
    diasAteInicio: 20,
  });
  assert.equal(j[2].estado, "concluida"); // Pagamentos quitados
  assert.equal(j[3].estado, "andamento"); // Pré-embarque próximo
});

test("viagem em andamento e pré-embarque concluído quando a data chegou", () => {
  const j = calcularJornada({
    temContrato: true,
    documentosEnviados: 3,
    parcelasPagas: 12,
    parcelasTotal: 12,
    diasAteInicio: -3,
  });
  assert.equal(j[3].estado, "concluida"); // Pré-embarque
  assert.equal(j[4].estado, "andamento"); // Durante a viagem
  assert.equal(j[5].estado, "pendente"); // Retorno (sem sinal confiável)
});

test("sem contrato: nada concluído", () => {
  const j = calcularJornada({
    temContrato: false,
    documentosEnviados: 0,
    parcelasPagas: 0,
    parcelasTotal: 0,
    diasAteInicio: null,
  });
  assert.equal(totalConcluidas(j), 0);
  assert.equal(indiceEtapaAtual(j), 0);
});
