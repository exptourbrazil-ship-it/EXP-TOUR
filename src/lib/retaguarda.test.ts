import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checarParcelaPagaSemLastro,
  checarPagamentoSemParcelaPaga,
  detectarRetaguarda,
  reconciliarAchados,
  type Achado,
  type SnapshotRetaguarda,
} from "./retaguarda.ts";

function snap(
  parcelas: SnapshotRetaguarda["parcelas"],
  pagamentos: SnapshotRetaguarda["pagamentos"],
): SnapshotRetaguarda {
  return { parcelas, pagamentos };
}

test("parcela paga COM lastro nao gera achado", () => {
  const s = snap(
    [{ id: "p1", contratoId: "c1", status: "pago", paidAt: "2026-01-01" }],
    [{ parcelaId: "p1", contratoId: "c1", externalPaymentId: "mp1" }],
  );
  assert.deepEqual(checarParcelaPagaSemLastro(s), []);
});

test("parcela paga SEM lastro gera achado alto", () => {
  const s = snap(
    [{ id: "p1", contratoId: "c1", status: "pago", paidAt: "2026-01-01" }],
    [],
  );
  const a = checarParcelaPagaSemLastro(s);
  assert.equal(a.length, 1);
  assert.equal(a[0].categoria, "parcela_paga_sem_lastro");
  assert.equal(a[0].severidade, "alto");
  assert.equal(a[0].chave, "retaguarda:parcela_paga_sem_lastro:p1");
  assert.equal(a[0].entidade.id, "p1");
  assert.equal(a[0].contratoId, "c1");
});

test("parcela pendente sem lastro NAO gera achado (so paga importa)", () => {
  const s = snap([{ id: "p1", contratoId: "c1", status: "pendente", paidAt: null }], []);
  assert.deepEqual(checarParcelaPagaSemLastro(s), []);
});

test("pagamento cuja parcela nao esta paga gera achado", () => {
  const s = snap(
    [{ id: "p1", contratoId: "c1", status: "pendente", paidAt: null }],
    [{ parcelaId: "p1", contratoId: "c1", externalPaymentId: "mp9" }],
  );
  const a = checarPagamentoSemParcelaPaga(s);
  assert.equal(a.length, 1);
  assert.equal(a[0].categoria, "pagamento_sem_parcela_paga");
  assert.equal(a[0].severidade, "alto");
  assert.match(a[0].resumo, /não está 'pago'/);
});

test("pagamento apontando parcela inexistente gera achado com texto proprio", () => {
  const s = snap([], [{ parcelaId: "pX", contratoId: "c1", externalPaymentId: "mp9" }]);
  const a = checarPagamentoSemParcelaPaga(s);
  assert.equal(a.length, 1);
  assert.match(a[0].resumo, /inexistente/);
});

test("multiplos pagamentos da mesma parcela nao conciliada => 1 achado (dedupe)", () => {
  const s = snap(
    [{ id: "p1", contratoId: "c1", status: "pendente", paidAt: null }],
    [
      { parcelaId: "p1", contratoId: "c1", externalPaymentId: "mpA" },
      { parcelaId: "p1", contratoId: "c1", externalPaymentId: "mpB" },
    ],
  );
  assert.equal(checarPagamentoSemParcelaPaga(s).length, 1);
});

test("pagamento conciliado (parcela paga) nao gera achado", () => {
  const s = snap(
    [{ id: "p1", contratoId: "c1", status: "pago", paidAt: "2026-01-01" }],
    [{ parcelaId: "p1", contratoId: "c1", externalPaymentId: "mp1" }],
  );
  assert.deepEqual(checarPagamentoSemParcelaPaga(s), []);
});

test("detectarRetaguarda roda todas e ordena por severidade+chave", () => {
  const s = snap(
    [
      { id: "p1", contratoId: "c1", status: "pago", paidAt: "2026-01-01" }, // sem lastro
      { id: "p2", contratoId: "c2", status: "pendente", paidAt: null }, // pagamento nao conciliado
    ],
    [{ parcelaId: "p2", contratoId: "c2", externalPaymentId: "mp2" }],
  );
  const achados = detectarRetaguarda(s);
  assert.equal(achados.length, 2);
  // Ambos alto -> ordena por chave. 'pagamento_...' < 'parcela_...' alfabeticamente.
  assert.equal(achados[0].categoria, "pagamento_sem_parcela_paga");
  assert.equal(achados[1].categoria, "parcela_paga_sem_lastro");
});

// ---- reconciliarAchados -----------------------------------------------------

function achado(chave: string): Achado {
  return {
    chave,
    categoria: "x",
    severidade: "alto",
    entidade: { tipo: "parcela", id: chave },
    contratoId: null,
    resumo: "r",
  };
}

test("reconciliar: achado novo -> abrir", () => {
  const plano = reconciliarAchados([achado("k1")], []);
  assert.equal(plano.abrir.length, 1);
  assert.equal(plano.abrir[0].chave, "k1");
  assert.deepEqual(plano.manter, []);
  assert.deepEqual(plano.reabrir, []);
  assert.deepEqual(plano.resolver, []);
});

test("reconciliar: achado ja aberto e presente -> manter", () => {
  const plano = reconciliarAchados([achado("k1")], [{ chave: "k1", status: "aberto" }]);
  assert.equal(plano.manter.length, 1);
  assert.equal(plano.abrir.length, 0);
});

test("reconciliar: achado resolvido que voltou -> reabrir", () => {
  const plano = reconciliarAchados([achado("k1")], [{ chave: "k1", status: "resolvido" }]);
  assert.equal(plano.reabrir.length, 1);
  assert.equal(plano.abrir.length, 0);
});

test("reconciliar: aberto que sumiu -> resolver", () => {
  const plano = reconciliarAchados([], [{ chave: "k1", status: "aberto" }]);
  assert.deepEqual(plano.resolver, ["k1"]);
});

test("reconciliar: resolvido ausente permanece intocado", () => {
  const plano = reconciliarAchados([], [{ chave: "k1", status: "resolvido" }]);
  assert.deepEqual(plano.resolver, []);
  assert.deepEqual(plano.abrir, []);
});

test("reconciliar: cenario misto", () => {
  const plano = reconciliarAchados(
    [achado("novo"), achado("mantido"), achado("voltou")],
    [
      { chave: "mantido", status: "aberto" },
      { chave: "voltou", status: "resolvido" },
      { chave: "sumiu", status: "aberto" },
    ],
  );
  assert.deepEqual(plano.abrir.map((a) => a.chave), ["novo"]);
  assert.deepEqual(plano.manter.map((a) => a.chave), ["mantido"]);
  assert.deepEqual(plano.reabrir.map((a) => a.chave), ["voltou"]);
  assert.deepEqual(plano.resolver, ["sumiu"]);
});
