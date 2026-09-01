// Testes do motor puro de repactuacao (guarda-corpos + snapshot + termo).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validarRepactuacao,
  montarSnapshotCronograma,
  renderizarTermoRepactuacao,
  trimestreISO,
  type ParcelaAtual,
  type ParcelaNova,
} from "./repactuacao.ts";

const HOJE = "2026-03-01";

function atual(over: Partial<ParcelaAtual> & { id: string; numero: number }): ParcelaAtual {
  return {
    valorAtual: 1000,
    vencimento: "2026-06-15",
    status: "pendente",
    temCobranca: false,
    isEntrada: false,
    ...over,
  };
}

// Plano base: entrada paga (500) + 2 futuras (1000 + 1000) = 2500. valorTotal 2500.
const BASE_ATUAIS: ParcelaAtual[] = [
  atual({ id: "e", numero: 0, valorAtual: 500, vencimento: "2026-02-01", status: "pago", isEntrada: true, temCobranca: true }),
  atual({ id: "a", numero: 1, valorAtual: 1000, vencimento: "2026-06-15" }),
  atual({ id: "b", numero: 2, valorAtual: 1000, vencimento: "2026-07-15" }),
];

function novasDe(atuais: ParcelaAtual[]): ParcelaNova[] {
  return atuais.map((p) => ({ id: p.id, numero: p.numero, valor: p.valorAtual, vencimento: p.vencimento }));
}

const argsBase = () => ({
  atuais: BASE_ATUAIS,
  novas: novasDe(BASE_ATUAIS),
  valorTotal: 2500,
  dataInicio: "2026-12-01",
  hojeISO: HOJE,
  repactuacoesNoTrimestre: 0,
});

// R1 — redistribuicao valida (mesma soma) passa e nao exige aprovacao.
test("R1 redistribuicao valida", () => {
  const novas: ParcelaNova[] = [
    { id: "e", numero: 0, valor: 500, vencimento: "2026-02-01" },
    { id: "a", numero: 1, valor: 800, vencimento: "2026-06-15" },
    { id: "b", numero: 2, valor: 1200, vencimento: "2026-08-15" },
  ];
  const r = validarRepactuacao({ ...argsBase(), novas });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.exigeAprovacao, false);
    assert.equal(r.totalPlano, 2500);
  }
});

// R2 — soma diverge (reduz a divida) e bloqueada.
test("R2 soma diverge", () => {
  const novas: ParcelaNova[] = [
    { id: "e", numero: 0, valor: 500, vencimento: "2026-02-01" },
    { id: "a", numero: 1, valor: 800, vencimento: "2026-06-15" },
    { id: "b", numero: 2, valor: 900, vencimento: "2026-08-15" }, // soma 2200 != 2500
  ];
  const r = validarRepactuacao({ ...argsBase(), novas });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.motivo, "soma_diverge");
});

// R3 — parcela em atraso trava o editor.
test("R3 parcela em atraso bloqueia", () => {
  const atuais = [
    BASE_ATUAIS[0],
    atual({ id: "a", numero: 1, valorAtual: 1000, vencimento: "2026-02-10", status: "atrasado" }),
    BASE_ATUAIS[2],
  ];
  const r = validarRepactuacao({ ...argsBase(), atuais, novas: novasDe(atuais) });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.motivo, "parcela_em_atraso");
});

// R3b — vencida nao paga (sem flag) tambem conta como atraso.
test("R3b vencida nao paga conta como atraso", () => {
  const atuais = [BASE_ATUAIS[0], atual({ id: "a", numero: 1, vencimento: "2026-01-15" }), BASE_ATUAIS[2]];
  const r = validarRepactuacao({ ...argsBase(), atuais, novas: novasDe(atuais) });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.motivo, "parcela_em_atraso");
});

// R4 — nao pode alterar parcela paga / com Pix (bloqueada).
test("R4 parcela bloqueada alterada", () => {
  const novas: ParcelaNova[] = [
    { id: "e", numero: 0, valor: 600, vencimento: "2026-02-01" }, // mexeu na entrada paga
    { id: "a", numero: 1, valor: 900, vencimento: "2026-06-15" },
    { id: "b", numero: 2, valor: 1000, vencimento: "2026-07-15" },
  ];
  const r = validarRepactuacao({ ...argsBase(), novas });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.motivo, "parcela_bloqueada_alterada");
});

// R4b — nao pode remover parcela bloqueada.
test("R4b parcela bloqueada removida", () => {
  const novas: ParcelaNova[] = [
    { id: "a", numero: 1, valor: 1500, vencimento: "2026-06-15" },
    { id: "b", numero: 2, valor: 1000, vencimento: "2026-07-15" },
  ]; // removeu a entrada paga
  const r = validarRepactuacao({ ...argsBase(), novas });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.motivo, "parcela_bloqueada_removida");
});

// R5 — valor abaixo do minimo (config).
test("R5 valor abaixo do minimo", () => {
  const novas: ParcelaNova[] = [
    { id: "e", numero: 0, valor: 500, vencimento: "2026-02-01" },
    { id: "a", numero: 1, valor: 100, vencimento: "2026-06-15" },
    { id: "b", numero: 2, valor: 1900, vencimento: "2026-08-15" },
  ];
  const r = validarRepactuacao({ ...argsBase(), novas, config: { valorMinimoParcela: 300 } });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.motivo, "valor_abaixo_minimo");
});

// R6 — a proxima parcela (dentro de D-3) nao pode ser alterada.
test("R6 proxima parcela dentro de D-3 nao pode mexer", () => {
  const atuais = [
    BASE_ATUAIS[0],
    atual({ id: "a", numero: 1, valorAtual: 1000, vencimento: "2026-03-02" }), // vence amanha
    atual({ id: "b", numero: 2, valorAtual: 1000, vencimento: "2026-07-15" }),
  ];
  const novas: ParcelaNova[] = [
    { id: "e", numero: 0, valor: 500, vencimento: "2026-02-01" },
    { id: "a", numero: 1, valor: 700, vencimento: "2026-03-02" }, // mexeu na iminente
    { id: "b", numero: 2, valor: 1300, vencimento: "2026-07-15" },
  ];
  const r = validarRepactuacao({ ...argsBase(), atuais, novas });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.motivo, "parcela_iminente_alterada");
});

// R6b — parcela iminente inalterada + redistribuicao das outras passa.
test("R6b iminente inalterada passa", () => {
  const atuais = [
    BASE_ATUAIS[0],
    atual({ id: "a", numero: 1, valorAtual: 1000, vencimento: "2026-03-02" }),
    atual({ id: "b", numero: 2, valorAtual: 1000, vencimento: "2026-07-15" }),
  ];
  const novas: ParcelaNova[] = [
    { id: "e", numero: 0, valor: 500, vencimento: "2026-02-01" },
    { id: "a", numero: 1, valor: 1000, vencimento: "2026-03-02" }, // intacta
    { id: "b", numero: 2, valor: 700, vencimento: "2026-07-15" },
    { numero: 3, valor: 300, vencimento: "2026-09-15" }, // nova
  ];
  const r = validarRepactuacao({ ...argsBase(), atuais, novas });
  assert.equal(r.ok, true);
});

// R7 — regra dos 30 dias (ultimo vencimento apos inicio-30).
test("R7 regra dos 30 dias", () => {
  const novas: ParcelaNova[] = [
    { id: "e", numero: 0, valor: 500, vencimento: "2026-02-01" },
    { id: "a", numero: 1, valor: 1000, vencimento: "2026-06-15" },
    { id: "b", numero: 2, valor: 1000, vencimento: "2026-11-20" }, // inicio 12-01 -> limite 11-01
  ];
  const r = validarRepactuacao({ ...argsBase(), novas });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.motivo, "regra_30_dias");
});

// R8 — 3a repactuacao no trimestre: valida, mas exige aprovacao humana.
test("R8 terceira no trimestre exige aprovacao", () => {
  const r = validarRepactuacao({ ...argsBase(), repactuacoesNoTrimestre: 2 });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.exigeAprovacao, true);
});

// R9 — snapshot canonico ordena por numero e arredonda.
test("R9 snapshot canonico", () => {
  const snap = montarSnapshotCronograma([
    { numero: 2, vencimento: "2026-07-15T00:00:00Z", valor: 1000.005, status: "pendente" },
    { numero: 1, vencimento: "2026-06-15", valor: 800 },
  ]);
  assert.deepEqual(snap, [
    { numero: 1, vencimento: "2026-06-15", valor: 800 },
    { numero: 2, vencimento: "2026-07-15", valor: 1000.01, status: "pendente" },
  ]);
});

// R12 — sem valor_total (legado): ancora na soma das ATUAIS. Redistribuicao que
// preserva o total passa; reducao e barrada (falha fechada, nao pula o guarda).
test("R12 sem valorTotal ancora na soma das atuais", () => {
  const okNovas: ParcelaNova[] = [
    { id: "e", numero: 0, valor: 500, vencimento: "2026-02-01" },
    { id: "a", numero: 1, valor: 700, vencimento: "2026-06-15" },
    { id: "b", numero: 2, valor: 1300, vencimento: "2026-08-15" },
  ]; // soma 2500 == soma das atuais
  const rOk = validarRepactuacao({ ...argsBase(), valorTotal: 0, novas: okNovas });
  assert.equal(rOk.ok, true);

  const reduz: ParcelaNova[] = [
    { id: "e", numero: 0, valor: 500, vencimento: "2026-02-01" },
    { id: "a", numero: 1, valor: 700, vencimento: "2026-06-15" },
    { id: "b", numero: 2, valor: 900, vencimento: "2026-08-15" },
  ]; // soma 2100 < 2500
  const rReduz = validarRepactuacao({ ...argsBase(), valorTotal: 0, novas: reduz });
  assert.equal(rReduz.ok, false);
  if (!rReduz.ok) assert.equal(rReduz.motivo, "soma_diverge");
});

// R11 — trimestre-calendario (YYYY-Qn) em UTC.
test("R11 trimestreISO", () => {
  assert.equal(trimestreISO("2026-01-15"), "2026-Q1");
  assert.equal(trimestreISO("2026-03-31"), "2026-Q1");
  assert.equal(trimestreISO("2026-04-01"), "2026-Q2");
  assert.equal(trimestreISO("2026-12-31"), "2026-Q4");
});

// R10 — termo deterministico (mesma entrada -> mesmo texto) e cita os totais.
test("R10 termo deterministico com totais", () => {
  const ant = montarSnapshotCronograma([{ numero: 1, vencimento: "2026-06-15", valor: 1000 }]);
  const nov = montarSnapshotCronograma([
    { numero: 1, vencimento: "2026-06-15", valor: 600 },
    { numero: 2, vencimento: "2026-08-15", valor: 400 },
  ]);
  const t1 = renderizarTermoRepactuacao({ moeda: "CAD", cronogramaAnterior: ant, cronogramaNovo: nov });
  const t2 = renderizarTermoRepactuacao({ moeda: "CAD", cronogramaAnterior: ant, cronogramaNovo: nov });
  assert.equal(t1, t2);
  assert.ok(t1.includes("Total anterior: CAD 1000.00"));
  assert.ok(t1.includes("Total novo: CAD 1000.00"));
  assert.ok(t1.includes("Clausula"));
});
