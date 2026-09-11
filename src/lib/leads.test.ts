import { test } from "node:test";
import assert from "node:assert/strict";
import {
  statusLeadValido,
  podeTransicionarLead,
  proximosStatusLead,
  resumoLeads,
  STATUS_LEAD_TERMINAL,
} from "./leads.ts";

test("statusLeadValido aceita so os status do funil", () => {
  assert.equal(statusLeadValido("novo"), true);
  assert.equal(statusLeadValido("convertido"), true);
  assert.equal(statusLeadValido("qualquer"), false);
  assert.equal(statusLeadValido(""), false);
  assert.equal(statusLeadValido(null), false);
  assert.equal(statusLeadValido(42), false);
});

test("mesmo status nao e transicao (no-op)", () => {
  assert.equal(podeTransicionarLead("novo", "novo"), false);
  assert.equal(podeTransicionarLead("cotacao", "cotacao"), false);
});

test("transicoes do funil de captacao", () => {
  assert.equal(podeTransicionarLead("novo", "em_contato"), true);
  assert.equal(podeTransicionarLead("novo", "cotacao"), true);
  assert.equal(podeTransicionarLead("novo", "descartado"), true);
  assert.equal(podeTransicionarLead("em_contato", "cotacao"), true);
  assert.equal(podeTransicionarLead("em_contato", "novo"), true);
  assert.equal(podeTransicionarLead("cotacao", "em_contato"), true);
});

test("nao se marca 'convertido' por transicao manual (so pela conversao em cliente)", () => {
  assert.equal(podeTransicionarLead("novo", "convertido"), false);
  assert.equal(podeTransicionarLead("cotacao", "convertido"), false);
  assert.equal(podeTransicionarLead("em_contato", "convertido"), false);
});

test("terminais podem ser reabertos como 'novo'", () => {
  assert.ok(STATUS_LEAD_TERMINAL.has("convertido"));
  assert.ok(STATUS_LEAD_TERMINAL.has("descartado"));
  assert.equal(podeTransicionarLead("descartado", "novo"), true);
  assert.equal(podeTransicionarLead("convertido", "novo"), true);
  // mas nao pulam direto para outro estagio
  assert.equal(podeTransicionarLead("descartado", "cotacao"), false);
});

test("proximosStatusLead nao inclui o proprio status", () => {
  const proximos = proximosStatusLead("novo");
  assert.ok(!proximos.includes("novo"));
  assert.ok(proximos.includes("em_contato"));
  assert.ok(proximos.includes("descartado"));
  assert.ok(!proximos.includes("convertido"));
});

test("resumoLeads conta por status + total", () => {
  const r = resumoLeads([
    { status: "novo" },
    { status: "novo" },
    { status: "cotacao" },
    { status: "convertido" },
    { status: "lixo_invalido" }, // ignorado na contagem por status
  ]);
  assert.equal(r.total, 5);
  assert.equal(r.novo, 2);
  assert.equal(r.cotacao, 1);
  assert.equal(r.convertido, 1);
  assert.equal(r.descartado, 0);
});
