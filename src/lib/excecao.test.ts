// Testes do modelo de processos de excecao (doc 01, Secao 4).
// Roda com o runner nativo do Node: `npm test` (node --test), sem dependencias.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DOMINIOS_SUSPENSAO,
  TIPOS_EXCECAO,
  STATUS_EXCECAO,
  DESFECHOS_EXCECAO,
  dominioSuspensaoValido,
  sanitizarSuspensoes,
  tipoExcecao,
  tipoExcecaoValido,
  labelTipoExcecao,
  suspendePadraoDoTipo,
  ehStatusTerminal,
  excecaoAtiva,
  transicaoPermitida,
  desfechoValido,
  dominiosSuspensos,
  estaSuspenso,
} from "./excecao.ts";

test("o catalogo cobre os 11 processos E1..E11 com slug e codigo unicos", () => {
  assert.equal(TIPOS_EXCECAO.length, 11);
  const codigos = new Set(TIPOS_EXCECAO.map((t) => t.codigo));
  const slugs = new Set(TIPOS_EXCECAO.map((t) => t.valor));
  assert.equal(codigos.size, 11);
  assert.equal(slugs.size, 11);
  for (let i = 1; i <= 11; i++) assert.ok(codigos.has("E" + i), `falta E${i}`);
});

test("todo tipo tem label e suspensoes padrao sao dominios validos", () => {
  for (const t of TIPOS_EXCECAO) {
    assert.ok(t.label && t.label.length > 0, `${t.valor} sem label`);
    for (const d of t.suspendePadrao) {
      assert.ok(dominioSuspensaoValido(d), `${t.valor}: dominio invalido ${d}`);
    }
  }
});

test("tipoExcecaoValido e tipoExcecao/label", () => {
  assert.equal(tipoExcecaoValido("visto_negado"), true);
  assert.equal(tipoExcecaoValido("qualquer_coisa"), false);
  assert.equal(tipoExcecaoValido(123), false);
  assert.equal(tipoExcecaoValido(null), false);
  assert.equal(tipoExcecao("visto_negado")?.codigo, "E1");
  assert.equal(labelTipoExcecao("visto_negado"), "Visto negado");
  assert.equal(labelTipoExcecao("inexistente"), "inexistente");
});

test("suspendePadraoDoTipo devolve copia (nao muta o catalogo)", () => {
  const a = suspendePadraoDoTipo("visto_negado");
  a.push("avanco");
  const b = suspendePadraoDoTipo("visto_negado");
  assert.deepEqual(b, ["cobranca", "lembretes"]);
});

test("sanitizarSuspensoes: filtra invalidos, dedup e ordem canonica", () => {
  assert.deepEqual(sanitizarSuspensoes(["avanco", "cobranca", "xpto", "cobranca"]), [
    "cobranca",
    "avanco",
  ]);
  assert.deepEqual(sanitizarSuspensoes("nao-array"), []);
  assert.deepEqual(sanitizarSuspensoes(null), []);
  assert.deepEqual(sanitizarSuspensoes(DOMINIOS_SUSPENSAO.slice()), [
    "cobranca",
    "lembretes",
    "avanco",
  ]);
});

test("estados terminais e ativos", () => {
  assert.equal(ehStatusTerminal("resolvida"), true);
  assert.equal(ehStatusTerminal("cancelada"), true);
  assert.equal(ehStatusTerminal("aberta"), false);
  assert.equal(ehStatusTerminal("em_andamento"), false);
  assert.equal(excecaoAtiva("aberta"), true);
  assert.equal(excecaoAtiva("resolvida"), false);
  // sanidade: todos os STATUS conhecidos
  assert.equal(STATUS_EXCECAO.length, 4);
});

test("maquina de estados: transicoes validas e invalidas", () => {
  // validas
  assert.equal(transicaoPermitida("aberta", "em_andamento"), true);
  assert.equal(transicaoPermitida("aberta", "resolvida"), true);
  assert.equal(transicaoPermitida("aberta", "cancelada"), true);
  assert.equal(transicaoPermitida("em_andamento", "resolvida"), true);
  assert.equal(transicaoPermitida("em_andamento", "aberta"), true);
  assert.equal(transicaoPermitida("resolvida", "em_andamento"), true); // reabrir
  // invalidas
  assert.equal(transicaoPermitida("aberta", "aberta"), false); // nao-op
  assert.equal(transicaoPermitida("cancelada", "em_andamento"), false); // definitivo
  assert.equal(transicaoPermitida("cancelada", "aberta"), false);
  assert.equal(transicaoPermitida("resolvida", "cancelada"), false);
});

test("desfechos validos", () => {
  assert.equal(DESFECHOS_EXCECAO.length, 3);
  assert.equal(desfechoValido("retomada"), true);
  assert.equal(desfechoValido("encerramento"), true);
  assert.equal(desfechoValido("qualquer"), false);
  assert.equal(desfechoValido(null), false);
});

test("dominiosSuspensos: uniao das excecoes ATIVAS, ignora terminais", () => {
  const excecoes = [
    { status: "aberta" as const, suspende: ["cobranca", "lembretes"] },
    { status: "em_andamento" as const, suspende: ["avanco"] },
    { status: "resolvida" as const, suspende: ["cobranca", "avanco"] }, // ignorada
    { status: "cancelada" as const, suspende: ["cobranca"] }, // ignorada
  ];
  assert.deepEqual(dominiosSuspensos(excecoes), ["cobranca", "lembretes", "avanco"]);
  assert.equal(estaSuspenso(excecoes, "cobranca"), true);
  assert.equal(estaSuspenso(excecoes, "avanco"), true);
});

test("dominiosSuspensos: sem excecoes ativas -> nada suspenso (jornada retoma)", () => {
  const excecoes = [
    { status: "resolvida" as const, suspende: ["cobranca", "lembretes", "avanco"] },
    { status: "cancelada" as const, suspende: ["cobranca"] },
  ];
  assert.deepEqual(dominiosSuspensos(excecoes), []);
  assert.equal(estaSuspenso(excecoes, "cobranca"), false);
  assert.equal(estaSuspenso([], "avanco"), false);
});

test("dominiosSuspensos: dado sujo no jsonb suspende nao quebra", () => {
  const excecoes = [
    { status: "aberta" as const, suspende: ["cobranca", "xpto", 42] },
    { status: "aberta" as const, suspende: "nao-array" },
    { status: "aberta" as const, suspende: null },
  ];
  assert.deepEqual(dominiosSuspensos(excecoes), ["cobranca"]);
});
