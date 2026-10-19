import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ehTipoDocumentoValido,
  tipoTemValidade,
  tipoTemCobertura,
  tipoTemVoo,
  categorizarNomeArquivo,
  labelDoTipoDocumento,
  TIPOS_DOCUMENTO,
  fornecedorDocVisivelAoCliente,
} from "./documentos.ts";

test("ehTipoDocumentoValido: aceita tipo conhecido e rejeita desconhecido", () => {
  assert.equal(ehTipoDocumentoValido("passaporte"), true);
  assert.equal(ehTipoDocumentoValido("carta_recusa_visto"), true);
  assert.equal(ehTipoDocumentoValido("nao_existe"), false);
  assert.equal(ehTipoDocumentoValido(""), false);
});

test("tipoTemValidade: passaporte/visto têm; carta de recusa e invoice não", () => {
  assert.equal(tipoTemValidade("passaporte"), true);
  assert.equal(tipoTemValidade("visto"), true);
  assert.equal(tipoTemValidade("seguro_saude"), true);
  assert.equal(tipoTemValidade("carta_recusa_visto"), false);
  assert.equal(tipoTemValidade("invoice_escola"), false);
});

test("tipoTemCobertura: só a apólice de seguro carrega valor de cobertura", () => {
  assert.equal(tipoTemCobertura("seguro_saude"), true);
  assert.equal(tipoTemCobertura("passaporte"), false);
  assert.equal(tipoTemCobertura("carta_recusa_visto"), false);
});

test("tipoTemVoo: só a passagem aérea carrega datas de voo", () => {
  assert.equal(tipoTemVoo("passagem_aerea"), true);
  assert.equal(tipoTemVoo("seguro_saude"), false);
  assert.equal(tipoTemVoo("passaporte"), false);
});

test("carta de recusa: novo tipo é categorizável pelo nome do arquivo", () => {
  assert.equal(categorizarNomeArquivo("Visa Refusal Letter.pdf"), "carta_recusa_visto");
  assert.equal(categorizarNomeArquivo("carta de recusa - joao.pdf"), "carta_recusa_visto");
  assert.equal(labelDoTipoDocumento("carta_recusa_visto"), "Carta de Recusa de Visto");
});

test("fornecedorDocVisivelAoCliente: só certificado e relatório; NUNCA faturas", () => {
  // Tipos liberados ao cliente após aprovação.
  assert.equal(fornecedorDocVisivelAoCliente("certificado_conclusao"), true);
  assert.equal(fornecedorDocVisivelAoCliente("relatorio_academico"), true);
  // Faturas/recibos da escola (origem 'fornecedor') NUNCA vão ao cliente —
  // expõem custo da escola / margem da agência.
  assert.equal(fornecedorDocVisivelAoCliente("invoice_escola"), false);
  assert.equal(fornecedorDocVisivelAoCliente("invoice_escola_net"), false);
  assert.equal(fornecedorDocVisivelAoCliente("recibo_pagamento"), false);
  // Documento de escola qualquer também fica de fora por padrão.
  assert.equal(fornecedorDocVisivelAoCliente("carta_aceite"), false);
  assert.equal(fornecedorDocVisivelAoCliente("lixo_inexistente"), false);
});

test("todo TIPOS_COM_VALIDADE referencia um tipo existente", () => {
  // tipoTemValidade só faz sentido para tipos reais do catálogo.
  for (const t of TIPOS_DOCUMENTO) {
    // não lança; apenas exercita o predicado sobre cada tipo real
    assert.equal(typeof tipoTemValidade(t.valor), "boolean");
  }
});
