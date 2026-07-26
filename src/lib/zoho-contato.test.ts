// Testes dos helpers puros do Contato do Zoho.
// Roda com o runner nativo do Node: `npm test` (node --test), sem dependencias.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolverTitular,
  cpfValido,
  soDigitos,
  nomeEstudante,
} from "./zoho-contato.ts";

test("usa o CPF do estudante quando preenchido", () => {
  const r = resolverTitular({
    Full_Name: "Luiza Haas",
    CPF: "123.456.789-09",
    CPF_do_Respons_vel_1: "111.111.111-11",
  });
  assert.equal(r.cpf, "12345678909");
  assert.equal(r.nome, "Luiza Haas");
  assert.equal(r.origemCpf, "estudante");
});

test("assume o CPF do responsavel 1 quando o estudante nao tem CPF", () => {
  const r = resolverTitular({
    Full_Name: "Luiza Haas",
    CPF: "",
    CPF_do_Respons_vel_1: "111.111.111-11",
    Nome_do_Respons_vel_1: "Mario Haas",
  });
  assert.equal(r.cpf, "11111111111");
  assert.equal(r.nome, "Mario Haas");
  assert.equal(r.origemCpf, "responsavel_1");
});

test("no fallback, cai para o nome do estudante se o responsavel nao tem nome", () => {
  const r = resolverTitular({
    Full_Name: "Luiza Haas",
    CPF: null,
    CPF_do_Respons_vel_1: "111.111.111-11",
  });
  assert.equal(r.cpf, "11111111111");
  assert.equal(r.nome, "Luiza Haas");
  assert.equal(r.origemCpf, "responsavel_1");
});

test("CPF incompleto do estudante nao bloqueia o fallback do responsavel", () => {
  const r = resolverTitular({
    Full_Name: "Luiza Haas",
    CPF: "123",
    CPF_do_Respons_vel_1: "111.111.111-11",
  });
  assert.equal(r.cpf, "11111111111");
  assert.equal(r.origemCpf, "responsavel_1");
});

test("sem nenhum CPF valido retorna vazio (webhook devolve 422)", () => {
  const r = resolverTitular({ Full_Name: "Luiza Haas" });
  assert.equal(r.cpf, "");
  assert.equal(r.origemCpf, null);
});

test("nomeEstudante monta a partir de First/Last quando nao ha Full_Name", () => {
  assert.equal(nomeEstudante({ First_Name: "Luiza", Last_Name: "Haas" }), "Luiza Haas");
});

test("cpfValido exige 11 digitos; soDigitos remove pontuacao", () => {
  assert.equal(soDigitos("123.456.789-09"), "12345678909");
  assert.equal(cpfValido("123.456.789-09"), true);
  assert.equal(cpfValido("123"), false);
  assert.equal(cpfValido(null), false);
});
