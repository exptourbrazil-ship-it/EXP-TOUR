import { test } from "node:test";
import assert from "node:assert/strict";
import {
  deriveEstadoContrato,
  podeTransicionar,
  proximosEstados,
  estadoTerminal,
  estadoValido,
  rotuloEstado,
  ESTADOS_CONTRATO,
  type FatosContrato,
  type EstadoContrato,
} from "./contrato-estados.ts";

const AGORA = "2026-09-12T12:00:00Z";
function fatos(over: Partial<FatosContrato> = {}): FatosContrato {
  return { agoraISO: AGORA, ...over };
}

// ---------------------------------------------------------------------------
// Derivação
// ---------------------------------------------------------------------------

test("só contrato (nada pago) -> proposta_enviada", () => {
  assert.equal(deriveEstadoContrato(fatos()), "proposta_enviada");
});

test("validade passou sem pagamento -> proposta_expirada", () => {
  assert.equal(deriveEstadoContrato(fatos({ propostaExpirada: true })), "proposta_expirada");
});

test("proposta_expirada NÃO vale se já pagou (pagamento vence a expiração)", () => {
  const e = deriveEstadoContrato(fatos({ propostaExpirada: true, entradaPaga: true }));
  assert.notEqual(e, "proposta_expirada");
  assert.equal(e, "aguardando_contrato");
});

test("entrada paga sem aceite -> aguardando_contrato", () => {
  assert.equal(deriveEstadoContrato(fatos({ entradaPaga: true })), "aguardando_contrato");
});

test("aceite do Termo (Sign inativo) conta como contrato -> matricula", () => {
  const e = deriveEstadoContrato(fatos({ entradaPaga: true, aceiteTermoEm: "2026-09-10T10:00:00Z" }));
  assert.equal(e, "matricula");
});

test("matrícula concluída -> documentacao", () => {
  const e = deriveEstadoContrato(fatos({ entradaPaga: true, aceiteTermoEm: "x", matriculaConcluida: true }));
  assert.equal(e, "documentacao");
});

test("docs aprovados, destino exige visto -> visto", () => {
  const e = deriveEstadoContrato(
    fatos({ entradaPaga: true, aceiteTermoEm: "x", matriculaConcluida: true, documentosAprovados: true }),
  );
  assert.equal(e, "visto");
});

test("docs aprovados + destino isento de visto -> pre_embarque", () => {
  const e = deriveEstadoContrato(
    fatos({ entradaPaga: true, aceiteTermoEm: "x", matriculaConcluida: true, documentosAprovados: true, destinoIsentoVisto: true }),
  );
  assert.equal(e, "pre_embarque");
});

test("visto aprovado -> pre_embarque", () => {
  const e = deriveEstadoContrato(fatos({ entradaPaga: true, aceiteTermoEm: "x", vistoStatus: "aprovado" }));
  assert.equal(e, "pre_embarque");
});

test("visto em análise -> visto", () => {
  const e = deriveEstadoContrato(fatos({ entradaPaga: true, aceiteTermoEm: "x", vistoStatus: "em_analise" }));
  assert.equal(e, "visto");
});

test("data de início passou -> em_programa (relógio é ground truth)", () => {
  const e = deriveEstadoContrato(fatos({ entradaPaga: true, aceiteTermoEm: "x", dataInicioISO: "2026-08-01" }));
  assert.equal(e, "em_programa");
});

test("data de retorno passou -> retorno", () => {
  const e = deriveEstadoContrato(
    fatos({ entradaPaga: true, aceiteTermoEm: "x", dataInicioISO: "2026-01-01", dataRetornoISO: "2026-06-01" }),
  );
  assert.equal(e, "retorno");
});

test("relógio avança mesmo sem sinais do meio (contrato provisionado pelo CRM)", () => {
  // Entrada paga + início já passou, sem aceite/docs/visto: ainda assim em_programa.
  const e = deriveEstadoContrato(fatos({ entradaPaga: true, dataInicioISO: "2026-08-01" }));
  assert.equal(e, "em_programa");
});

test("cancelado tem precedência sobre qualquer sinal", () => {
  const e = deriveEstadoContrato(
    fatos({ entradaPaga: true, aceiteTermoEm: "x", vistoStatus: "aprovado", dataInicioISO: "2026-08-01", canceladoEm: "2026-09-01" }),
  );
  assert.equal(e, "cancelado");
});

test("aceite antes de pagar não avança (gatilho-mestre é o pagamento)", () => {
  const e = deriveEstadoContrato(fatos({ aceiteTermoEm: "2026-09-10T10:00:00Z" }));
  assert.equal(e, "proposta_enviada");
});

// ---------------------------------------------------------------------------
// Transições
// ---------------------------------------------------------------------------

test("transições válidas da linha principal", () => {
  assert.equal(podeTransicionar("proposta_enviada", "entrada_paga"), true);
  assert.equal(podeTransicionar("entrada_paga", "aguardando_contrato"), true);
  assert.equal(podeTransicionar("aguardando_contrato", "matricula"), true);
  assert.equal(podeTransicionar("documentacao", "pre_embarque"), true); // destino isento
  assert.equal(podeTransicionar("visto", "documentacao"), true); // reaplicação
  assert.equal(podeTransicionar("retorno", "concluido"), true);
});

test("transições inválidas (pular etapas / andar para trás)", () => {
  assert.equal(podeTransicionar("proposta_enviada", "visto"), false);
  assert.equal(podeTransicionar("entrada_paga", "proposta_enviada"), false);
  assert.equal(podeTransicionar("proposta_enviada", "proposta_enviada"), false);
});

test("cancelamento possível antes do embarque, não depois", () => {
  assert.equal(podeTransicionar("proposta_enviada", "cancelado"), true);
  assert.equal(podeTransicionar("pre_embarque", "cancelado"), true);
  assert.equal(podeTransicionar("em_programa", "cancelado"), false);
});

test("estados terminais não têm saída", () => {
  assert.deepEqual(proximosEstados("concluido"), []);
  assert.deepEqual(proximosEstados("cancelado"), []);
  assert.equal(estadoTerminal("concluido"), true);
  assert.equal(estadoTerminal("cancelado"), true);
  assert.equal(estadoTerminal("visto"), false);
});

test("proposta expirada pode ser retrabalhada", () => {
  assert.equal(podeTransicionar("proposta_expirada", "proposta_enviada"), true);
});

// ---------------------------------------------------------------------------
// Utilitários
// ---------------------------------------------------------------------------

test("estadoValido reconhece só estados conhecidos", () => {
  assert.equal(estadoValido("visto"), true);
  assert.equal(estadoValido("inexistente"), false);
});

test("todo estado tem rótulo", () => {
  for (const e of ESTADOS_CONTRATO) {
    assert.equal(typeof rotuloEstado(e as EstadoContrato), "string");
    assert.ok(rotuloEstado(e as EstadoContrato).length > 0);
  }
});
