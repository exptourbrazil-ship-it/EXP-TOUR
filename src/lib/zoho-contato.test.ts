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
  dadosComerciais,
  normalizarMoeda,
} from "./zoho-contato.ts";

test("titular e o responsavel 1, mesmo com o estudante tendo CPF proprio", () => {
  const r = resolverTitular({
    Full_Name: "Luiza Haas",
    CPF: "123.456.789-09",
    CPF_do_Respons_vel_1: "111.111.111-11",
    Nome_do_Respons_vel_1: "Fernanda Haas",
  });
  assert.equal(r.cpf, "11111111111");
  assert.equal(r.nome, "Fernanda Haas");
  assert.equal(r.origemCpf, "responsavel_1");
});

test("cai para o CPF do estudante quando nao ha responsavel 1 (aluno adulto)", () => {
  const r = resolverTitular({
    Full_Name: "Joao Adulto",
    CPF: "123.456.789-09",
    CPF_do_Respons_vel_1: "",
  });
  assert.equal(r.cpf, "12345678909");
  assert.equal(r.nome, "Joao Adulto");
  assert.equal(r.origemCpf, "estudante");
});

test("usa o CPF do responsavel 1 e cai para o nome do estudante se o responsavel nao tem nome", () => {
  const r = resolverTitular({
    Full_Name: "Luiza Haas",
    CPF: null,
    CPF_do_Respons_vel_1: "111.111.111-11",
  });
  assert.equal(r.cpf, "11111111111");
  assert.equal(r.nome, "Luiza Haas");
  assert.equal(r.origemCpf, "responsavel_1");
});

test("CPF incompleto do responsavel 1 cai para o CPF do estudante", () => {
  const r = resolverTitular({
    Full_Name: "Luiza Haas",
    CPF: "123.456.789-09",
    CPF_do_Respons_vel_1: "111",
  });
  assert.equal(r.cpf, "12345678909");
  assert.equal(r.origemCpf, "estudante");
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

test("normalizarMoeda traduz as opcoes legadas do Zoho", () => {
  assert.equal(normalizarMoeda("Opção 1"), "BRL");
  assert.equal(normalizarMoeda("Opção 2"), "USD");
  assert.equal(normalizarMoeda("CAD"), "CAD");
  assert.equal(normalizarMoeda(""), "BRL");
  assert.equal(normalizarMoeda("-None-"), "BRL");
  assert.equal(normalizarMoeda(null), "BRL");
});

test("dadosComerciais: o Contato vence quando tem Valor_Total (comercial por cliente)", () => {
  const c = dadosComerciais(
    {
      Full_Name: "Aluno X",
      Valor_Total: "12000",
      Moeda: "CAD",
      Valor_de_Entrada: "2000",
      Numero_de_Parcelas: "10",
    },
    // Produto (catalogo) com precos diferentes: devem ser ignorados.
    {
      Product_Name: "Ingles Geral",
      Moeda_do_Produto: "USD",
      Preco_na_Moeda_Original: "999",
      Numero_de_Parcelas: "3",
      Valor_de_Entrada: "1",
    }
  );
  assert.deepEqual(c, {
    nomeProduto: "Ingles Geral",
    moeda: "CAD",
    valorTotal: 12000,
    valorEntrada: 2000,
    numeroParcelas: 10,
    origem: "contato",
  });
});

test("dadosComerciais: cai para o Produto quando o Contato nao tem Valor_Total (retrocompat)", () => {
  const c = dadosComerciais(
    { Full_Name: "Aluno Antigo" },
    {
      Product_Name: "Pacote Canada",
      Moeda_do_Produto: "Opção 2", // USD legado
      Preco_na_Moeda_Original: "8000",
      Unit_Price: "40000", // BRL: ignorado porque a moeda e USD
      Numero_de_Parcelas: "8",
      Valor_de_Entrada: "1500",
    }
  );
  assert.deepEqual(c, {
    nomeProduto: "Pacote Canada",
    moeda: "USD",
    valorTotal: 8000,
    valorEntrada: 1500,
    numeroParcelas: 8,
    origem: "produto",
  });
});

test("dadosComerciais: Produto BRL usa o Preco Unitario", () => {
  const c = dadosComerciais(
    { Full_Name: "Aluno BRL" },
    { Moeda_do_Produto: "BRL", Unit_Price: "30000", Numero_de_Parcelas: "12" }
  );
  assert.equal(c.moeda, "BRL");
  assert.equal(c.valorTotal, 30000);
  assert.equal(c.numeroParcelas, 12);
});

test("dadosComerciais: sem comercial em lugar nenhum -> zeros (a rota valida depois)", () => {
  const c = dadosComerciais({ Full_Name: "Vazio" }, {});
  assert.equal(c.valorTotal, 0);
  assert.equal(c.numeroParcelas, 0);
  assert.equal(c.valorEntrada, 0);
  assert.equal(c.moeda, "BRL");
  assert.equal(c.nomeProduto, "Viagem EXP Tour");
});
