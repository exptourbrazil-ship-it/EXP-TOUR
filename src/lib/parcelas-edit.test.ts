// Testes do validador puro de edicao de parcelas (parcelas-edit.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { validarEdicaoParcelas, parcelaTravada, type ParcelaAtual, type ParcelaEditInput } from "./parcelas-edit.ts";

const atual = (id: string, valor: number, over: Partial<ParcelaAtual> = {}): ParcelaAtual => ({
  id, status: "pendente", qr_code_url: null, external_payment_id: null, valor_atual: valor, ...over,
});
const inp = (over: Partial<ParcelaEditInput>): ParcelaEditInput => ({
  descricao: "Parcela", valor: 100, vencimento: "2026-01-15", ...over,
});

test("parcelaTravada: paga, Pix gerado OU ordem MP em voo", () => {
  assert.equal(parcelaTravada({ status: "pago" }), true);
  assert.equal(parcelaTravada({ status: "pendente", qr_code_url: "http://x" }), true);
  // ordem MP em voo (external_payment_id) SEM qr_code_url ainda é travada
  assert.equal(parcelaTravada({ status: "pendente", qr_code_url: null, external_payment_id: "mp-123" }), true);
  assert.equal(parcelaTravada({ status: "pendente", qr_code_url: null, external_payment_id: null }), false);
  assert.equal(parcelaTravada(null), false);
});

test("ordem MP em voo protege a parcela (não pode remover)", () => {
  const r = validarEdicaoParcelas({
    parcelas: [inp({ valor: 300 })], // omitiu a parcela com ordem em voo
    atuais: [atual("a", 100, { external_payment_id: "mp-1" }), atual("b", 200)],
    valorTotal: 300,
    dataInicio: null,
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.codigo, "remover_travada");
});

test("edita e adiciona parcelas em aberto (sem valor_total)", () => {
  const r = validarEdicaoParcelas({
    parcelas: [inp({ id: "a", valor: 200 }), inp({ valor: 300 })],
    atuais: [atual("a", 100), atual("b", 100)],
    valorTotal: null,
    dataInicio: null,
  });
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual(r.remover, ["b"]); // "a" mantida (editada), "b" removida
});

test("rejeita valores inválidos e parcela que não pertence", () => {
  assert.equal(validarEdicaoParcelas({ parcelas: [], atuais: [], valorTotal: null, dataInicio: null }).ok, false);
  const semValor = validarEdicaoParcelas({ parcelas: [inp({ valor: 0 })], atuais: [], valorTotal: null, dataInicio: null });
  assert.equal(semValor.ok, false);
  if (!semValor.ok) assert.equal(semValor.codigo, "campos");
  const fantasma = validarEdicaoParcelas({ parcelas: [inp({ id: "x" })], atuais: [], valorTotal: null, dataInicio: null });
  if (!fantasma.ok) assert.equal(fantasma.codigo, "nao_pertence");
});

// ── Comportamento pós-pagamento (o pedido do usuário) ────────────────────────
test("PAGA é pass-through: mantém a paga e ajusta as demais; soma usa valor congelado", () => {
  // total 300: paga 100 (a) + em aberto (b 200). Cliente redistribui: mantém a
  // (paga), troca b por duas novas somando 200.
  const r = validarEdicaoParcelas({
    parcelas: [
      inp({ id: "a", valor: 999 }), // input tenta mudar a paga -> ignorado; soma usa 100
      inp({ valor: 120 }),
      inp({ valor: 80 }),
    ],
    atuais: [atual("a", 100, { status: "pago" }), atual("b", 200)],
    valorTotal: 300,
    dataInicio: null,
  });
  assert.ok(r.ok, r.ok ? "" : (r as any).mensagem);
  if (r.ok) {
    assert.deepEqual(r.remover, ["b"]); // b (em aberto) removida; a NÃO
    assert.ok(r.travadas.has("a"));
  }
});

test("não pode REMOVER uma parcela paga (precisa ser mantida)", () => {
  const r = validarEdicaoParcelas({
    parcelas: [inp({ valor: 300 })], // omitiu a paga "a"
    atuais: [atual("a", 100, { status: "pago" }), atual("b", 200)],
    valorTotal: 300,
    dataInicio: null,
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.codigo, "remover_travada");
});

test("soma tem que bater com valor_total (com paga congelada)", () => {
  const r = validarEdicaoParcelas({
    parcelas: [inp({ id: "a", valor: 100 }), inp({ valor: 150 })], // 100(pago)+150 = 250 != 300
    atuais: [atual("a", 100, { status: "pago" }), atual("b", 200)],
    valorTotal: 300,
    dataInicio: null,
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.codigo, "soma");
});

test("regra dos 30 dias vale só para as parcelas em aberto", () => {
  // data_inicio 2026-03-01 -> limite 2026-01-30. Parcela aberta vence depois -> erro.
  const ruim = validarEdicaoParcelas({
    parcelas: [inp({ valor: 100, vencimento: "2026-02-20" })],
    atuais: [],
    valorTotal: null,
    dataInicio: "2026-03-01",
  });
  assert.equal(ruim.ok, false);
  if (!ruim.ok) assert.equal(ruim.codigo, "d30");
  // dentro do limite -> ok
  const bom = validarEdicaoParcelas({
    parcelas: [inp({ valor: 100, vencimento: "2026-01-10" })],
    atuais: [],
    valorTotal: null,
    dataInicio: "2026-03-01",
  });
  assert.ok(bom.ok);
});
