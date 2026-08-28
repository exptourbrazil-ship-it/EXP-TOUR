// Testes dos helpers puros do pedido de confirmacao de disponibilidade.
import { test } from "node:test";
import assert from "node:assert/strict";
import { validarSolicitacao, validarResposta } from "./confirmacao-disponibilidade.ts";

test("validarSolicitacao: supplier obrigatorio; kind default vaga; contrato/message opcionais", () => {
  const ok = validarSolicitacao({ supplierId: "s1", contratoId: "c1", kind: "adiamento", message: "  confirmam julho?  " });
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.deepEqual(ok.dados, { supplierId: "s1", contratoId: "c1", kind: "adiamento", message: "confirmam julho?" });
  }

  const semOpcionais = validarSolicitacao({ supplierId: "s1" });
  assert.equal(semOpcionais.ok, true);
  if (semOpcionais.ok) {
    assert.equal(semOpcionais.dados.kind, "vaga");
    assert.equal(semOpcionais.dados.contratoId, null);
    assert.equal(semOpcionais.dados.message, null);
  }

  assert.equal(validarSolicitacao({}).ok, false); // sem supplier
  assert.equal(validarSolicitacao({ supplierId: "s1", kind: "outro" }).ok, false); // kind invalido
});

test("validarResposta: so aceitar/recusar; nota opcional; pending nao e resposta", () => {
  const ok = validarResposta({ status: "accepted", note: "  ok  " });
  assert.equal(ok.ok, true);
  if (ok.ok) assert.deepEqual(ok.dados, { status: "accepted", note: "ok" });

  assert.equal(validarResposta({ status: "declined" }).ok, true);
  assert.equal(validarResposta({ status: "pending" }).ok, false);
  assert.equal(validarResposta({ status: "" }).ok, false);
  assert.equal(validarResposta({ status: "maybe" }).ok, false);
});
