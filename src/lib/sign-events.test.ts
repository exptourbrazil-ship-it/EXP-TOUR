// Testes dos helpers puros do fluxo Zoho Sign. Roda com `npm test` (node --test).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mapearStatusSign, extrairEventoSign, montarSignatarios } from "./sign-events.ts";

test("mapearStatusSign normaliza os status crus do Zoho", () => {
  assert.equal(mapearStatusSign("completed"), "assinado");
  assert.equal(mapearStatusSign("SIGNED"), "assinado");
  assert.equal(mapearStatusSign("declined"), "recusado");
  assert.equal(mapearStatusSign("expired"), "expirado");
  assert.equal(mapearStatusSign("inprogress"), "em_andamento");
  assert.equal(mapearStatusSign("qualquer_coisa"), "desconhecido");
  assert.equal(mapearStatusSign(null), "desconhecido");
});

test("extrairEventoSign lê o request_id/status em requests{}", () => {
  const ev = extrairEventoSign({ requests: { request_id: "123", request_status: "completed" } });
  assert.equal(ev?.envelopeId, "123");
  assert.equal(ev?.statusRaw, "completed");
  assert.equal(ev?.status, "assinado");
});

test("extrairEventoSign tolera formatos alternativos (requestId no topo)", () => {
  const ev = extrairEventoSign({ requestId: 999, status: "declined" });
  assert.equal(ev?.envelopeId, "999");
  assert.equal(ev?.status, "recusado");
});

test("extrairEventoSign retorna null sem id de request", () => {
  assert.equal(extrairEventoSign({ requests: { request_status: "completed" } }), null);
  assert.equal(extrairEventoSign({}), null);
});

test("montarSignatarios: menor de idade -> só o pagante", () => {
  const sig = montarSignatarios({
    pagante: { nome: "Mãe", email: "mae@x.com" },
    estudante: { nome: "Filho", email: "filho@x.com" },
    estudanteEhMenor: true,
  });
  assert.equal(sig.length, 1);
  assert.equal(sig[0].papel, "pagante");
  assert.equal(sig[0].ordem, 1);
});

test("montarSignatarios: estudante maior -> pagante + estudante", () => {
  const sig = montarSignatarios({
    pagante: { nome: "Pai", email: "pai@x.com" },
    estudante: { nome: "Filha", email: "filha@x.com" },
    estudanteEhMenor: false,
  });
  assert.equal(sig.length, 2);
  assert.deepEqual(
    sig.map((s) => s.papel),
    ["pagante", "estudante"]
  );
  assert.equal(sig[1].ordem, 2);
});

test("montarSignatarios: não duplica quando pagante e estudante têm o mesmo e-mail", () => {
  const sig = montarSignatarios({
    pagante: { nome: "Ana", email: "ana@x.com" },
    estudante: { nome: "Ana", email: "ANA@x.com" },
    estudanteEhMenor: false,
  });
  assert.equal(sig.length, 1);
});

test("montarSignatarios: descarta pagante sem e-mail", () => {
  const sig = montarSignatarios({
    pagante: { nome: "Sem Email", email: null },
    estudante: { nome: "Maior", email: "maior@x.com" },
    estudanteEhMenor: false,
  });
  // pagante sem e-mail sai; estudante maior entra (ordem recalculada para 1)
  assert.equal(sig.length, 1);
  assert.equal(sig[0].papel, "estudante");
  assert.equal(sig[0].ordem, 1);
});
