import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checarParcelaPagaSemLastro,
  checarPagamentoSemParcelaPaga,
  checarRemessaAntesDoD7,
  checarAlteracaoSemAceite,
  checarRepactuacaoSemAceite,
  checarDocumentoValidadeInsuficiente,
  checarCartaRecusaNaoRepassada,
  checarSeguroAusenteAntesEmbarque,
  checarSeguroVigenciaInsuficiente,
  checarSeguroCoberturaAbaixoMinimo,
  adicionarMesesISO,
  adicionarDiasISO,
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

// ---- checarRemessaAntesDoD7 -------------------------------------------------

function doc(over: Partial<{
  docId: string; contratoId: string; compartilhadoEmISO: string | null;
  janelaFimISO: string | null; processamentoImediato: boolean;
  processamentoImediatoMarcadoEmISO: string | null;
}> = {}) {
  return {
    docId: over.docId ?? "d1",
    contratoId: over.contratoId ?? "c1",
    compartilhadoEmISO: over.compartilhadoEmISO === undefined ? "2026-01-05T00:00:00Z" : over.compartilhadoEmISO,
    janelaFimISO: over.janelaFimISO === undefined ? "2026-01-10T00:00:00Z" : over.janelaFimISO,
    processamentoImediato: over.processamentoImediato ?? false,
    processamentoImediatoMarcadoEmISO:
      over.processamentoImediatoMarcadoEmISO === undefined ? null : over.processamentoImediatoMarcadoEmISO,
  };
}

test("D+7: compartilhado ANTES do fim da janela -> achado alto", () => {
  const a = checarRemessaAntesDoD7({ parcelas: [], pagamentos: [], docsCompartilhados: [doc()] });
  assert.equal(a.length, 1);
  assert.equal(a[0].categoria, "remessa_antes_do_d7");
  assert.equal(a[0].severidade, "alto");
  assert.equal(a[0].entidade.tipo, "documento");
  assert.equal(a[0].chave, "retaguarda:remessa_antes_do_d7:d1");
});

test("D+7: compartilhado DEPOIS da janela -> sem achado", () => {
  const a = checarRemessaAntesDoD7({
    parcelas: [], pagamentos: [],
    docsCompartilhados: [doc({ compartilhadoEmISO: "2026-01-11T00:00:00Z" })],
  });
  assert.deepEqual(a, []);
});

test("D+7: processamento imediato marcado ANTES do share -> nao flagra", () => {
  const a = checarRemessaAntesDoD7({
    parcelas: [], pagamentos: [],
    docsCompartilhados: [doc({
      processamentoImediato: true,
      processamentoImediatoMarcadoEmISO: "2026-01-01T00:00:00Z", // antes do share (01-05)
    })],
  });
  assert.deepEqual(a, []);
});

test("D+7: processamento imediato RETROATIVO (marcado depois do share) -> flagra", () => {
  const a = checarRemessaAntesDoD7({
    parcelas: [], pagamentos: [],
    docsCompartilhados: [doc({
      processamentoImediato: true,
      processamentoImediatoMarcadoEmISO: "2026-01-08T00:00:00Z", // depois do share (01-05)
    })],
  });
  assert.equal(a.length, 1);
  assert.equal(a[0].categoria, "remessa_antes_do_d7");
});

test("D+7: sem janela conhecida nao flagra (defensivo)", () => {
  const a = checarRemessaAntesDoD7({
    parcelas: [], pagamentos: [],
    docsCompartilhados: [doc({ janelaFimISO: null })],
  });
  assert.deepEqual(a, []);
});

test("D+7: visivel ao fornecedor SEM carimbo -> achado proprio", () => {
  const a = checarRemessaAntesDoD7({
    parcelas: [], pagamentos: [],
    docsCompartilhados: [doc({ compartilhadoEmISO: null })],
  });
  assert.equal(a.length, 1);
  assert.equal(a[0].categoria, "compartilhado_sem_carimbo");
  assert.equal(a[0].severidade, "alto");
  assert.equal(a[0].chave, "retaguarda:compartilhado_sem_carimbo:d1");
});

test("D+7: snapshot sem docsCompartilhados nao quebra", () => {
  const a = checarRemessaAntesDoD7({ parcelas: [], pagamentos: [] });
  assert.deepEqual(a, []);
});

// ---- checarAlteracaoSemAceite -----------------------------------------------

function alt(over: Partial<{
  id: string; contratoId: string; tipo: string; status: string;
  delta: number | null; aditivoAceitoEmISO: string | null;
}> = {}) {
  return {
    id: over.id ?? "a1",
    contratoId: over.contratoId ?? "c1",
    tipo: over.tipo ?? "escopo",
    status: over.status ?? "aplicado",
    delta: over.delta === undefined ? 500 : over.delta,
    aditivoAceitoEmISO: over.aditivoAceitoEmISO === undefined ? null : over.aditivoAceitoEmISO,
  };
}

test("alteracao: aditivo (delta>0) aplicado SEM aceite -> achado alto", () => {
  const a = checarAlteracaoSemAceite({ parcelas: [], pagamentos: [], alteracoes: [alt()] });
  assert.equal(a.length, 1);
  assert.equal(a[0].categoria, "alteracao_sem_aceite");
  assert.equal(a[0].severidade, "alto");
  assert.equal(a[0].entidade.tipo, "alteracao");
  assert.equal(a[0].chave, "retaguarda:alteracao_sem_aceite:a1");
});

test("alteracao: aditivo aplicado COM aceite -> sem achado", () => {
  const a = checarAlteracaoSemAceite({
    parcelas: [], pagamentos: [],
    alteracoes: [alt({ aditivoAceitoEmISO: "2026-02-01T00:00:00Z" })],
  });
  assert.deepEqual(a, []);
});

test("alteracao: deferral (E2) nunca flagra", () => {
  const a = checarAlteracaoSemAceite({
    parcelas: [], pagamentos: [],
    alteracoes: [alt({ tipo: "deferral", delta: null })],
  });
  assert.deepEqual(a, []);
});

test("alteracao: credito (delta<0) nao flagra", () => {
  const a = checarAlteracaoSemAceite({
    parcelas: [], pagamentos: [],
    alteracoes: [alt({ delta: -300 })],
  });
  assert.deepEqual(a, []);
});

test("alteracao: neutro (delta 0) nao flagra", () => {
  const a = checarAlteracaoSemAceite({
    parcelas: [], pagamentos: [],
    alteracoes: [alt({ delta: 0 })],
  });
  assert.deepEqual(a, []);
});

test("alteracao: rascunho (nao aplicado) nao flagra", () => {
  const a = checarAlteracaoSemAceite({
    parcelas: [], pagamentos: [],
    alteracoes: [alt({ status: "rascunho" })],
  });
  assert.deepEqual(a, []);
});

// ---- checarRepactuacaoSemAceite ---------------------------------------------

function rep(over: Partial<{
  id: string; contratoId: string; status: string; aceitoEmISO: string | null;
}> = {}) {
  return {
    id: over.id ?? "r1",
    contratoId: over.contratoId ?? "c1",
    status: over.status ?? "aplicada",
    aceitoEmISO: over.aceitoEmISO === undefined ? null : over.aceitoEmISO,
  };
}

test("repactuacao: aplicada SEM aceite -> achado alto", () => {
  const a = checarRepactuacaoSemAceite({ parcelas: [], pagamentos: [], repactuacoes: [rep()] });
  assert.equal(a.length, 1);
  assert.equal(a[0].categoria, "repactuacao_sem_aceite");
  assert.equal(a[0].severidade, "alto");
  assert.equal(a[0].entidade.tipo, "repactuacao");
  assert.equal(a[0].contratoId, "c1");
  assert.equal(a[0].chave, "retaguarda:repactuacao_sem_aceite:r1");
});

test("repactuacao: aplicada COM aceite -> sem achado", () => {
  const a = checarRepactuacaoSemAceite({
    parcelas: [], pagamentos: [],
    repactuacoes: [rep({ aceitoEmISO: "2026-02-01T00:00:00Z" })],
  });
  assert.deepEqual(a, []);
});

test("repactuacao: aguardando_aprovacao sem aceite nao flagra (nao aplicada)", () => {
  const a = checarRepactuacaoSemAceite({
    parcelas: [], pagamentos: [],
    repactuacoes: [rep({ status: "aguardando_aprovacao" })],
  });
  assert.deepEqual(a, []);
});

test("repactuacao: recusada/cancelada nao flagra", () => {
  const a = checarRepactuacaoSemAceite({
    parcelas: [], pagamentos: [],
    repactuacoes: [rep({ id: "r2", status: "recusada" }), rep({ id: "r3", status: "cancelada" })],
  });
  assert.deepEqual(a, []);
});

test("repactuacao: snapshot sem o array nao quebra", () => {
  const a = checarRepactuacaoSemAceite({ parcelas: [], pagamentos: [] });
  assert.deepEqual(a, []);
});

// ---- adicionarMesesISO ------------------------------------------------------

test("adicionarMesesISO: soma simples de meses", () => {
  assert.equal(adicionarMesesISO("2026-03-15", 6), "2026-09-15");
});

test("adicionarMesesISO: vira o ano", () => {
  assert.equal(adicionarMesesISO("2026-10-01", 6), "2027-04-01");
});

test("adicionarMesesISO: estouro de dia normaliza para o ultimo dia do mes", () => {
  // 31 de agosto + 6 = fevereiro (28 em ano nao bissexto).
  assert.equal(adicionarMesesISO("2025-08-31", 6), "2026-02-28");
});

test("adicionarMesesISO: data invalida -> null", () => {
  assert.equal(adicionarMesesISO("nao-e-data", 6), null);
});

// ---- checarDocumentoValidadeInsuficiente ------------------------------------

function docV(over: Partial<{
  docId: string; contratoId: string; validadeISO: string; referenciaISO: string;
}> = {}) {
  return {
    docId: over.docId ?? "d1",
    contratoId: over.contratoId ?? "c1",
    validadeISO: over.validadeISO ?? "2026-06-01",
    referenciaISO: over.referenciaISO ?? "2026-09-01",
  };
}

test("validade: expira ANTES da referencia -> achado medio", () => {
  const a = checarDocumentoValidadeInsuficiente({ parcelas: [], pagamentos: [], docsValidade: [docV()] });
  assert.equal(a.length, 1);
  assert.equal(a[0].categoria, "documento_validade_insuficiente");
  assert.equal(a[0].severidade, "medio");
  assert.equal(a[0].entidade.tipo, "documento");
  assert.equal(a[0].contratoId, "c1");
  assert.equal(a[0].chave, "retaguarda:documento_validade_insuficiente:d1");
});

test("validade: cobre a referencia (igual) -> sem achado", () => {
  const a = checarDocumentoValidadeInsuficiente({
    parcelas: [], pagamentos: [],
    docsValidade: [docV({ validadeISO: "2026-09-01", referenciaISO: "2026-09-01" })],
  });
  assert.deepEqual(a, []);
});

test("validade: cobre a referencia (depois) -> sem achado", () => {
  const a = checarDocumentoValidadeInsuficiente({
    parcelas: [], pagamentos: [],
    docsValidade: [docV({ validadeISO: "2027-01-01", referenciaISO: "2026-09-01" })],
  });
  assert.deepEqual(a, []);
});

test("validade: campos vazios nao quebram nem flagram", () => {
  const a = checarDocumentoValidadeInsuficiente({
    parcelas: [], pagamentos: [],
    docsValidade: [docV({ validadeISO: "", referenciaISO: "2026-09-01" })],
  });
  assert.deepEqual(a, []);
});

test("validade: snapshot sem o array nao quebra", () => {
  const a = checarDocumentoValidadeInsuficiente({ parcelas: [], pagamentos: [] });
  assert.deepEqual(a, []);
});

// ---- checarCartaRecusaNaoRepassada ------------------------------------------

function carta(over: Partial<{
  docId: string; contratoId: string; compartilhado: boolean; prazoRepasseISO: string; hojeISO: string;
}> = {}) {
  return {
    docId: over.docId ?? "k1",
    contratoId: over.contratoId ?? "c1",
    compartilhado: over.compartilhado ?? false,
    prazoRepasseISO: over.prazoRepasseISO ?? "2026-03-10",
    hojeISO: over.hojeISO ?? "2026-03-12",
  };
}

test("carta recusa: nao repassada e hoje > prazo -> achado medio", () => {
  const a = checarCartaRecusaNaoRepassada({ parcelas: [], pagamentos: [], cartasRecusa: [carta()] });
  assert.equal(a.length, 1);
  assert.equal(a[0].categoria, "carta_recusa_visto_atrasada");
  assert.equal(a[0].severidade, "medio");
  assert.equal(a[0].entidade.tipo, "documento");
  assert.equal(a[0].contratoId, "c1");
  assert.equal(a[0].chave, "retaguarda:carta_recusa_visto_atrasada:k1");
});

test("carta recusa: ja repassada -> sem achado", () => {
  const a = checarCartaRecusaNaoRepassada({
    parcelas: [], pagamentos: [],
    cartasRecusa: [carta({ compartilhado: true })],
  });
  assert.deepEqual(a, []);
});

test("carta recusa: dentro do prazo (hoje == prazo) -> sem achado", () => {
  const a = checarCartaRecusaNaoRepassada({
    parcelas: [], pagamentos: [],
    cartasRecusa: [carta({ hojeISO: "2026-03-10", prazoRepasseISO: "2026-03-10" })],
  });
  assert.deepEqual(a, []);
});

test("carta recusa: hoje antes do prazo -> sem achado", () => {
  const a = checarCartaRecusaNaoRepassada({
    parcelas: [], pagamentos: [],
    cartasRecusa: [carta({ hojeISO: "2026-03-09", prazoRepasseISO: "2026-03-10" })],
  });
  assert.deepEqual(a, []);
});

test("carta recusa: prazo vazio nao quebra nem flagra", () => {
  const a = checarCartaRecusaNaoRepassada({
    parcelas: [], pagamentos: [],
    cartasRecusa: [carta({ prazoRepasseISO: "" })],
  });
  assert.deepEqual(a, []);
});

test("carta recusa: snapshot sem o array nao quebra", () => {
  const a = checarCartaRecusaNaoRepassada({ parcelas: [], pagamentos: [] });
  assert.deepEqual(a, []);
});

// ---- adicionarDiasISO -------------------------------------------------------

test("adicionarDiasISO: soma e subtrai dias, vira mes/ano", () => {
  assert.equal(adicionarDiasISO("2026-03-15", 10), "2026-03-25");
  assert.equal(adicionarDiasISO("2026-03-05", -10), "2026-02-23");
  assert.equal(adicionarDiasISO("2026-01-01", -1), "2025-12-31");
  assert.equal(adicionarDiasISO("nao-e-data", 5), null);
});

// ---- checarSeguroAusenteAntesEmbarque ---------------------------------------

function seg(over: Partial<{
  contratoId: string; temSeguro: boolean; limiteAlertaISO: string; hojeISO: string;
}> = {}) {
  return {
    contratoId: over.contratoId ?? "c1",
    temSeguro: over.temSeguro ?? false,
    limiteAlertaISO: over.limiteAlertaISO ?? "2026-05-01",
    hojeISO: over.hojeISO ?? "2026-05-10",
  };
}

test("seguro: sem apolice e dentro da janela (hoje >= limite) -> achado medio", () => {
  const a = checarSeguroAusenteAntesEmbarque({ parcelas: [], pagamentos: [], segurosContrato: [seg()] });
  assert.equal(a.length, 1);
  assert.equal(a[0].categoria, "seguro_ausente_embarque");
  assert.equal(a[0].severidade, "medio");
  assert.equal(a[0].entidade.tipo, "contrato");
  assert.equal(a[0].contratoId, "c1");
  assert.equal(a[0].chave, "retaguarda:seguro_ausente_embarque:c1");
});

test("seguro: com apolice -> sem achado", () => {
  const a = checarSeguroAusenteAntesEmbarque({
    parcelas: [], pagamentos: [], segurosContrato: [seg({ temSeguro: true })],
  });
  assert.deepEqual(a, []);
});

test("seguro: embarque ainda longe (hoje < limite) -> sem achado", () => {
  const a = checarSeguroAusenteAntesEmbarque({
    parcelas: [], pagamentos: [], segurosContrato: [seg({ hojeISO: "2026-04-01", limiteAlertaISO: "2026-05-01" })],
  });
  assert.deepEqual(a, []);
});

test("seguro: hoje == limite (fronteira) -> achado", () => {
  const a = checarSeguroAusenteAntesEmbarque({
    parcelas: [], pagamentos: [], segurosContrato: [seg({ hojeISO: "2026-05-01", limiteAlertaISO: "2026-05-01" })],
  });
  assert.equal(a.length, 1);
});

test("seguro: snapshot sem o array nao quebra", () => {
  const a = checarSeguroAusenteAntesEmbarque({ parcelas: [], pagamentos: [] });
  assert.deepEqual(a, []);
});

// ---- checarSeguroVigenciaInsuficiente ---------------------------------------

function vig(over: Partial<{
  contratoId: string; coberturaAteISO: string; referenciaISO: string;
}> = {}) {
  return {
    contratoId: over.contratoId ?? "c1",
    coberturaAteISO: over.coberturaAteISO ?? "2026-06-01",
    referenciaISO: over.referenciaISO ?? "2026-07-01",
  };
}

test("vigencia: cobertura termina ANTES da referencia -> achado medio", () => {
  const a = checarSeguroVigenciaInsuficiente({ parcelas: [], pagamentos: [], segurosVigencia: [vig()] });
  assert.equal(a.length, 1);
  assert.equal(a[0].categoria, "seguro_vigencia_insuficiente");
  assert.equal(a[0].severidade, "medio");
  assert.equal(a[0].entidade.tipo, "contrato");
  assert.equal(a[0].contratoId, "c1");
  assert.equal(a[0].chave, "retaguarda:seguro_vigencia_insuficiente:c1");
});

test("vigencia: cobertura alcanca a referencia (igual) -> sem achado", () => {
  const a = checarSeguroVigenciaInsuficiente({
    parcelas: [], pagamentos: [], segurosVigencia: [vig({ coberturaAteISO: "2026-07-01", referenciaISO: "2026-07-01" })],
  });
  assert.deepEqual(a, []);
});

test("vigencia: cobertura vai alem da referencia -> sem achado", () => {
  const a = checarSeguroVigenciaInsuficiente({
    parcelas: [], pagamentos: [], segurosVigencia: [vig({ coberturaAteISO: "2026-12-31", referenciaISO: "2026-07-01" })],
  });
  assert.deepEqual(a, []);
});

test("vigencia: snapshot sem o array nao quebra", () => {
  const a = checarSeguroVigenciaInsuficiente({ parcelas: [], pagamentos: [] });
  assert.deepEqual(a, []);
});

// ---- checarSeguroCoberturaAbaixoMinimo --------------------------------------

function cob(over: Partial<{
  contratoId: string; coberturaValor: number; minimoValor: number; moeda: string;
}> = {}) {
  return {
    contratoId: over.contratoId ?? "c1",
    coberturaValor: over.coberturaValor ?? 20000,
    minimoValor: over.minimoValor ?? 30000,
    moeda: over.moeda ?? "EUR",
  };
}

test("cobertura: abaixo do minimo -> achado medio", () => {
  const a = checarSeguroCoberturaAbaixoMinimo({ parcelas: [], pagamentos: [], segurosCobertura: [cob()] });
  assert.equal(a.length, 1);
  assert.equal(a[0].categoria, "seguro_cobertura_abaixo_minimo");
  assert.equal(a[0].severidade, "medio");
  assert.equal(a[0].entidade.tipo, "contrato");
  assert.equal(a[0].contratoId, "c1");
  assert.equal(a[0].chave, "retaguarda:seguro_cobertura_abaixo_minimo:c1");
});

test("cobertura: igual ao minimo -> sem achado", () => {
  const a = checarSeguroCoberturaAbaixoMinimo({
    parcelas: [], pagamentos: [], segurosCobertura: [cob({ coberturaValor: 30000 })],
  });
  assert.deepEqual(a, []);
});

test("cobertura: acima do minimo -> sem achado", () => {
  const a = checarSeguroCoberturaAbaixoMinimo({
    parcelas: [], pagamentos: [], segurosCobertura: [cob({ coberturaValor: 50000 })],
  });
  assert.deepEqual(a, []);
});

test("cobertura: minimo zero/invalido -> sem achado (nada a exigir)", () => {
  const a = checarSeguroCoberturaAbaixoMinimo({
    parcelas: [], pagamentos: [], segurosCobertura: [cob({ minimoValor: 0 })],
  });
  assert.deepEqual(a, []);
});

test("cobertura: snapshot sem o array nao quebra", () => {
  const a = checarSeguroCoberturaAbaixoMinimo({ parcelas: [], pagamentos: [] });
  assert.deepEqual(a, []);
});
