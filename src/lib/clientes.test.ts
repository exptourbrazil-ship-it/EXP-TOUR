// Testes do helper puro da carteira de clientes.
// Roda com o runner nativo do Node: `npm test` (node --test).
import { test } from "node:test";
import assert from "node:assert/strict";
import { agruparCarteira, normalizarBusca, resumoCarteira } from "./clientes.ts";
import type { TitularInput, ContratoInput, ParcelaInput } from "./clientes.ts";

const HOJE = "2026-07-29";

function titular(id: string, nome: string, cpf = ""): TitularInput {
  return { id, nome_completo: nome, cpf, telefone: null, email: null, data_inicio: null };
}

test("inclui titular sem contrato (zerado)", () => {
  const carteira = agruparCarteira([titular("t1", "Ana")], [], [], HOJE);
  assert.equal(carteira.length, 1);
  assert.equal(carteira[0].numContratos, 0);
  assert.equal(carteira[0].parcelasTotal, 0);
  assert.deepEqual(carteira[0].saldoPorMoeda, {});
});

test("ordena por nome (pt-BR) e agrega destinos/estudantes distintos", () => {
  const titulares = [titular("t1", "Bruno"), titular("t2", "Ana")];
  const contratos: ContratoInput[] = [
    { id: "c1", titular_id: "t2", estudante_nome: "Ana Jr", pais_destino: "canada", moeda: "CAD" },
    { id: "c2", titular_id: "t2", estudante_nome: "Ana Jr", pais_destino: "eua", moeda: "USD" },
  ];
  const carteira = agruparCarteira(titulares, contratos, [], HOJE);
  assert.equal(carteira[0].nome, "Ana"); // ordenado
  assert.equal(carteira[0].numContratos, 2);
  assert.deepEqual(carteira[0].destinos, ["canada", "eua"]);
  assert.deepEqual(carteira[0].estudantes, ["Ana Jr"]); // distinto
  assert.equal(carteira[1].nome, "Bruno");
});

test("progresso de parcelas, atraso e saldo por moeda", () => {
  const titulares = [titular("t1", "Ana")];
  const contratos: ContratoInput[] = [
    { id: "c1", titular_id: "t1", estudante_nome: null, pais_destino: "canada", moeda: "CAD" },
  ];
  const parcelas: ParcelaInput[] = [
    { contrato_id: "c1", status: "pago", valor_atual: 100, vencimento: "2026-06-10" },
    { contrato_id: "c1", status: "pendente", valor_atual: 200, vencimento: "2026-07-10" }, // vencida
    { contrato_id: "c1", status: "pendente", valor_atual: 300, vencimento: "2026-08-30" }, // futura
  ];
  const c = agruparCarteira(titulares, contratos, parcelas, HOJE)[0];
  assert.equal(c.parcelasTotal, 3);
  assert.equal(c.parcelasPagas, 1);
  assert.equal(c.emAtraso, 1);
  // saldo em aberto = 200 + 300 (a paga nao entra)
  assert.deepEqual(c.saldoPorMoeda, { CAD: 500 });
});

test("saldo separado por moeda quando o titular tem contratos em moedas diferentes", () => {
  const titulares = [titular("t1", "Ana")];
  const contratos: ContratoInput[] = [
    { id: "c1", titular_id: "t1", estudante_nome: null, pais_destino: "canada", moeda: "CAD" },
    { id: "c2", titular_id: "t1", estudante_nome: null, pais_destino: "eua", moeda: "usd" },
  ];
  const parcelas: ParcelaInput[] = [
    { contrato_id: "c1", status: "pendente", valor_atual: 100, vencimento: "2026-08-10" },
    { contrato_id: "c2", status: "pendente", valor_atual: "50.5", vencimento: "2026-08-10" },
  ];
  const c = agruparCarteira(titulares, contratos, parcelas, HOJE)[0];
  assert.deepEqual(c.saldoPorMoeda, { CAD: 100, USD: 50.5 }); // moeda normalizada
});

test("ignora parcela de contrato cujo titular nao esta na lista", () => {
  const titulares = [titular("t1", "Ana")];
  const contratos: ContratoInput[] = [
    { id: "c9", titular_id: "tX", estudante_nome: null, pais_destino: null, moeda: "CAD" },
  ];
  const parcelas: ParcelaInput[] = [
    { contrato_id: "c9", status: "pendente", valor_atual: 999, vencimento: "2026-08-10" },
  ];
  const c = agruparCarteira(titulares, contratos, parcelas, HOJE)[0];
  assert.equal(c.parcelasTotal, 0);
  assert.deepEqual(c.saldoPorMoeda, {});
});

test("conta processos ativos por titular (excecoes)", () => {
  const ts = [titular("t1", "Ana"), titular("t2", "Bruno")];
  const carteira = agruparCarteira(ts, [], [], HOJE, [
    { titular_id: "t1" },
    { titular_id: "t1" },
    { titular_id: "t2" },
    { titular_id: "desconhecido" }, // titular fora da lista: ignorado
  ]);
  const porNome = Object.fromEntries(carteira.map((c) => [c.nome, c.processosAtivos]));
  assert.equal(porNome["Ana"], 2);
  assert.equal(porNome["Bruno"], 1);
});

test("processosAtivos default zero sem excecoes", () => {
  const carteira = agruparCarteira([titular("t1", "Ana")], [], [], HOJE);
  assert.equal(carteira[0].processosAtivos, 0);
});

test("normalizarBusca remove acentos e baixa a caixa", () => {
  assert.equal(normalizarBusca("João"), "joao");
  assert.equal(normalizarBusca("MÜLLER"), "muller");
  assert.equal(normalizarBusca("Conceição"), "conceicao");
  assert.equal(normalizarBusca(null), "");
  assert.equal(normalizarBusca(undefined), "");
});

test("resumoCarteira agrega total, atraso, processos e saldo por moeda", () => {
  const ts = [titular("t1", "Ana"), titular("t2", "Bruno"), titular("t3", "Cida")];
  const cs: ContratoInput[] = [
    { id: "c1", titular_id: "t1", estudante_nome: null, pais_destino: null, moeda: "CAD" },
    { id: "c2", titular_id: "t2", estudante_nome: null, pais_destino: null, moeda: "USD" },
  ];
  const ps: ParcelaInput[] = [
    { contrato_id: "c1", status: "pendente", valor_atual: 100, vencimento: "2026-01-01" }, // vencida (atraso)
    { contrato_id: "c2", status: "pendente", valor_atual: 200, vencimento: "2030-01-01" }, // futura
  ];
  const carteira = agruparCarteira(ts, cs, ps, HOJE, [{ titular_id: "t1" }]);
  const r = resumoCarteira(carteira);
  assert.equal(r.total, 3);
  assert.equal(r.comAtraso, 1); // só Ana
  assert.equal(r.comProcessoAtivo, 1); // só Ana
  assert.deepEqual(r.saldoPorMoeda, { CAD: 100, USD: 200 });
});
