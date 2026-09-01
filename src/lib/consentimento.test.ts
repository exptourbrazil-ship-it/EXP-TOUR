// Testes do motor puro de consentimentos (LGPD, Clausulas 15/16).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CATALOGO_CONSENTIMENTOS,
  tipoConsentimento,
  estadoAtualConsentimentos,
  consentimentoVigente,
  renderizarTextoConsentimento,
  type RegistroConsentimento,
  type TipoConsentimento,
} from "./consentimento.ts";

// L1 — imagem e FACULTATIVA (Clausula 16); saude e SENSIVEL (Clausula 15).
test("L1 catalogo: imagem facultativa, saude sensivel", () => {
  const imagem = tipoConsentimento("imagem");
  const saude = tipoConsentimento("saude");
  assert.equal(imagem?.facultativo, true);
  assert.equal(imagem?.sensivel, false);
  assert.equal(saude?.facultativo, false);
  assert.equal(saude?.sensivel, true);
  // compartilhamento e transferencia internacional existem no catalogo.
  assert.ok(tipoConsentimento("compartilhamento_fornecedores"));
  assert.ok(tipoConsentimento("transferencia_internacional"));
});

// L2 — sem nenhum registro: tudo nao-concedido e nao-vigente (nada pre-marcado).
test("L2 estado inicial: nada concedido", () => {
  const est = estadoAtualConsentimentos([]);
  assert.equal(est.length, CATALOGO_CONSENTIMENTOS.length);
  assert.ok(est.every((e) => !e.concedido && !e.vigente));
});

// L3 — a ultima linha por tipo vence (ledger append-only: conceder -> revogar).
test("L3 ultima linha vence (revogacao)", () => {
  const regs: RegistroConsentimento[] = [
    { tipo: "imagem", concedido: true, versao: "1", criado_em: "2026-01-01T10:00:00Z" },
    { tipo: "imagem", concedido: false, versao: "1", criado_em: "2026-02-01T10:00:00Z" }, // revogou
  ];
  assert.equal(consentimentoVigente(regs, "imagem"), false);
  const est = estadoAtualConsentimentos(regs).find((e) => e.tipo === "imagem");
  assert.equal(est?.concedido, false);
  assert.equal(est?.em, "2026-02-01T10:00:00Z");
});

// L3b — conceder depois de revogar volta a vigorar.
test("L3b reconsentir apos revogar", () => {
  const regs: RegistroConsentimento[] = [
    { tipo: "saude", concedido: true, versao: "1", criado_em: "2026-01-01T10:00:00Z" },
    { tipo: "saude", concedido: false, versao: "1", criado_em: "2026-02-01T10:00:00Z" },
    { tipo: "saude", concedido: true, versao: "1", criado_em: "2026-03-01T10:00:00Z" },
  ];
  assert.equal(consentimentoVigente(regs, "saude"), true);
});

// L4 — versao antiga NAO vigora na versao atual (precisa reconsentir).
test("L4 versao antiga nao vigora", () => {
  const catalogoV2: TipoConsentimento[] = CATALOGO_CONSENTIMENTOS.map((t) =>
    t.chave === "imagem" ? { ...t, versao: "2" } : t,
  );
  const regs: RegistroConsentimento[] = [
    { tipo: "imagem", concedido: true, versao: "1", criado_em: "2026-01-01T10:00:00Z" },
  ];
  // concedido, mas na versao 1 enquanto o catalogo agora exige a 2.
  assert.equal(consentimentoVigente(regs, "imagem", catalogoV2), false);
  const est = estadoAtualConsentimentos(regs, catalogoV2).find((e) => e.tipo === "imagem");
  assert.equal(est?.concedido, true);
  assert.equal(est?.vigente, false);
});

// L5 — texto deterministico cita o rotulo, a versao e a finalidade.
test("L5 texto deterministico do consentimento", () => {
  const t1 = renderizarTextoConsentimento("saude");
  const t2 = renderizarTextoConsentimento("saude");
  assert.equal(t1, t2);
  assert.ok(t1.includes("Dados de saúde"));
  assert.ok(t1.includes("v1"));
  assert.equal(renderizarTextoConsentimento("inexistente"), "");
});
