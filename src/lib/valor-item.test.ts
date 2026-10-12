// Testes do valor exibido de um item da cotação.
import { test } from "node:test";
import assert from "node:assert/strict";
import { valorExibidoDoItem, ROTULO_INCLUIDA_NO_CURSO } from "./valor-item.ts";

test("acomodação com bruto zero mostra 'Incluída no valor do curso'", () => {
  assert.equal(valorExibidoDoItem("accommodation", 0, "£ 0,00"), ROTULO_INCLUIDA_NO_CURSO);
  assert.equal(ROTULO_INCLUIDA_NO_CURSO, "Incluída no valor do curso");
});

test("acomodação com valor positivo mostra o valor", () => {
  assert.equal(valorExibidoDoItem("accommodation", 1204, "US$ 1.204,00"), "US$ 1.204,00");
});

test("acomodação com desconto (negativo) continua mostrando o valor", () => {
  assert.equal(valorExibidoDoItem("accommodation", -864, "-£ 864,00"), "-£ 864,00");
});

test("zero em curso, seguro ou serviço NÃO é disfarçado", () => {
  assert.equal(valorExibidoDoItem("program", 0, "£ 0,00"), "£ 0,00");
  assert.equal(valorExibidoDoItem("insurance", 0, "£ 0,00"), "£ 0,00");
  assert.equal(valorExibidoDoItem("other", 0, "£ 0,00"), "£ 0,00");
  assert.equal(valorExibidoDoItem(undefined, 0, "£ 0,00"), "£ 0,00");
});
