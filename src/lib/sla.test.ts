import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calcularPrazoSLA,
  avaliarSLA,
  rankUrgenciaSLA,
  type Feriados,
} from "./sla.ts";

// Seg 2026-09-14 .. Sex 2026-09-18; Sáb/Dom 19-20; Seg 21.
test("calcularPrazoSLA: pula fim de semana", () => {
  // Abertura sexta 2026-09-18, SLA 1 dia útil -> segunda 2026-09-21 (pula 19/20).
  assert.equal(calcularPrazoSLA("2026-09-18", 1), "2026-09-21");
  // SLA 2 dias úteis a partir de segunda 14 -> quarta 16.
  assert.equal(calcularPrazoSLA("2026-09-14", 2), "2026-09-16");
  // SLA 0 -> mesmo dia.
  assert.equal(calcularPrazoSLA("2026-09-14", 0), "2026-09-14");
});

test("calcularPrazoSLA: respeita feriado", () => {
  const feriados: Feriados = new Set(["2026-09-15"]); // terça feriado
  // Segunda 14 + 2 úteis, pulando terça feriado -> quinta 17.
  assert.equal(calcularPrazoSLA("2026-09-14", 2, feriados), "2026-09-17");
});

test("avaliarSLA: no prazo, vence hoje, vencido", () => {
  // Prazo = quarta 16 (abertura seg 14 + 2 úteis).
  const noPrazo = avaliarSLA("2026-09-14", 2, "2026-09-14"); // hoje seg
  assert.equal(noPrazo.prazoISO, "2026-09-16");
  assert.equal(noPrazo.status, "no_prazo");
  assert.equal(noPrazo.diasUteisRestantes, 2); // ter, qua

  const venceHoje = avaliarSLA("2026-09-14", 2, "2026-09-16");
  assert.equal(venceHoje.status, "vence_hoje");
  assert.equal(venceHoje.diasUteisRestantes, 0);
  assert.equal(venceHoje.atrasoDiasUteis, 0);

  const vencido = avaliarSLA("2026-09-14", 2, "2026-09-18"); // 2 úteis após o prazo (qui 17, sex 18)
  assert.equal(vencido.status, "vencido");
  assert.equal(vencido.diasUteisRestantes, -2);
  assert.equal(vencido.atrasoDiasUteis, 2);
});

test("avaliarSLA: fim de semana não conta como atraso", () => {
  // Prazo sexta 18; no sábado 19 ainda não venceu 1 dia ÚTIL (sáb não conta).
  const sabado = avaliarSLA("2026-09-17", 1, "2026-09-19"); // abertura qui 17, +1 útil = sex 18
  assert.equal(sabado.prazoISO, "2026-09-18");
  // hoje sábado 19 > prazo sexta 18, mas nenhum dia útil se passou depois do prazo.
  assert.equal(sabado.status, "vencido");
  assert.equal(sabado.atrasoDiasUteis, 0); // 0 dias úteis de atraso (só o fim de semana)
});

test("rankUrgenciaSLA: vencido < vence_hoje < no_prazo; mais atraso no topo", () => {
  const vencidoMais = avaliarSLA("2026-09-07", 1, "2026-09-18"); // bem atrasado
  const vencidoMenos = avaliarSLA("2026-09-16", 1, "2026-09-18");
  const hoje = avaliarSLA("2026-09-16", 2, "2026-09-18");
  const noPrazo = avaliarSLA("2026-09-18", 3, "2026-09-18");

  assert.ok(rankUrgenciaSLA(vencidoMais) < rankUrgenciaSLA(vencidoMenos));
  assert.ok(rankUrgenciaSLA(vencidoMenos) < rankUrgenciaSLA(hoje));
  assert.ok(rankUrgenciaSLA(hoje) < rankUrgenciaSLA(noPrazo));
});
