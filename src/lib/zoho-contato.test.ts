// Testes dos helpers puros do Contato do Zoho.
// Roda com o runner nativo do Node: `npm test` (node --test), sem dependencias.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolverTitular,
  cpfValido,
  soDigitos,
  nomeEstudante,
  nomeLookup,
  normalizarSexo,
  slugDestino,
  dataZoho,
  dadosPrograma,
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

test("nomeLookup extrai de objeto { name } ou de string", () => {
  assert.equal(nomeLookup({ name: "Kaplan - Toronto" }), "Kaplan - Toronto");
  assert.equal(nomeLookup("ILAC - Vancouver"), "ILAC - Vancouver");
  assert.equal(nomeLookup(null), null);
  assert.equal(nomeLookup({ name: "" }), null);
});

test("normalizarSexo aceita M/F e Masculino/Feminino", () => {
  assert.equal(normalizarSexo("M"), "M");
  assert.equal(normalizarSexo("F"), "F");
  assert.equal(normalizarSexo("Masculino"), "M");
  assert.equal(normalizarSexo("feminino"), "F");
  assert.equal(normalizarSexo(""), null);
  assert.equal(normalizarSexo(null), null);
});

test("slugDestino mapeia os destinos suportados (com/sem acento)", () => {
  assert.equal(slugDestino({ name: "Canadá" }), "canada");
  assert.equal(slugDestino({ name: "Estados Unidos" }), "eua");
  assert.equal(slugDestino("EUA"), "eua");
  assert.equal(slugDestino({ name: "Nova Zelândia" }), "nova_zelandia");
});

test("slugDestino gera slug generico para pais ainda nao suportado", () => {
  assert.equal(slugDestino({ name: "Irlanda" }), "irlanda");
  assert.equal(slugDestino({ name: "Reino Unido" }), "reino_unido");
  assert.equal(slugDestino(null), null);
});

test("dataZoho extrai a parte da data", () => {
  assert.equal(dataZoho("2026-09-15"), "2026-09-15");
  assert.equal(dataZoho("2026-09-15T00:00:00-03:00"), "2026-09-15");
  assert.equal(dataZoho(""), null);
  assert.equal(dataZoho(null), null);
});

test("dadosPrograma reune os campos do programa no formato do banco", () => {
  const p = dadosPrograma({
    Full_Name: "Luiza Haas",
    Sexo: "F",
    Destino: { name: "Canadá" },
    Data_de_Inicio: "2026-09-15",
    Vendor_Name: { name: "ILAC - Toronto" },
  });
  assert.deepEqual(p, {
    estudanteNome: "Luiza Haas",
    estudanteSexo: "F",
    paisDestino: "canada",
    dataInicio: "2026-09-15",
    escolaNome: "ILAC - Toronto",
  });
});

test("dadosPrograma retorna nulos quando o Contato nao tem os campos", () => {
  const p = dadosPrograma({ Full_Name: "Sem Programa" });
  assert.equal(p.estudanteSexo, null);
  assert.equal(p.paisDestino, null);
  assert.equal(p.dataInicio, null);
  assert.equal(p.escolaNome, null);
});
