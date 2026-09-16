// Testes das regras puras da leitura de material por IA (F3.1).
// Roda com o runner nativo do Node: `npm test` (node --test), sem dependencias.
import { test } from "node:test";
import assert from "node:assert/strict";
import { statusLeituraInicial, podeLer, resolverCampusParaLeitura, STATUS_LEITURA, STATUS_LEITURA_LABEL } from "./material-leitura.ts";

function mat(over: Partial<Parameters<typeof podeLer>[0]> = {}) {
  return {
    tipo: "price_list",
    mime: "application/pdf",
    linkUrl: null,
    storagePath: "materiais/sup/x.pdf",
    status: "pendente",
    archivedAt: null,
    leituraStatus: "pendente",
    ...over,
  };
}

test("L1 status inicial: price list so PDF; brochura PDF ou imagem; link/outros nao suportados; foto nao aplicavel", () => {
  assert.equal(statusLeituraInicial("price_list", "application/pdf", null), "pendente");
  assert.equal(statusLeituraInicial("price_list", "image/png", null), "nao_suportado"); // tabela em imagem: fora
  assert.equal(statusLeituraInicial("price_list", null, "https://x/y"), "nao_suportado");
  assert.equal(statusLeituraInicial("brochura", "application/pdf", null), "pendente"); // F3.2
  assert.equal(statusLeituraInicial("brochura", "image/jpeg", null), "pendente"); // F3.2: imagem tambem
  assert.equal(statusLeituraInicial("brochura", "image/gif", null), "nao_suportado");
  assert.equal(statusLeituraInicial("brochura", null, "https://x/y"), "nao_suportado");
  assert.equal(statusLeituraInicial("foto", "image/png", null), "nao_aplicavel");
});

test("L2 podeLer: pendente le; ja processado so com forcar; 'lendo' nunca", () => {
  assert.ok(podeLer(mat()).ok);
  const lida = podeLer(mat({ leituraStatus: "lida" }));
  assert.ok(!lida.ok);
  assert.ok(podeLer(mat({ leituraStatus: "lida" }), true).ok);
  assert.ok(podeLer(mat({ leituraStatus: "erro" }), true).ok);
  assert.ok(!podeLer(mat({ leituraStatus: "lendo" }), true).ok); // claim vivo: nem com forcar
  // Claim OBSOLETO (processo morreu no meio): a fila retoma sozinha, sem SQL manual.
  assert.ok(podeLer(mat({ leituraStatus: "lendo" }), false, true).ok);
});

test("L3 podeLer: nunca le rejeitado/arquivado; formato/tipo errados apontam o status destino", () => {
  assert.ok(!podeLer(mat({ status: "rejeitado" })).ok);
  assert.ok(!podeLer(mat({ archivedAt: "2026-09-16T00:00:00Z" })).ok);
  const img = podeLer(mat({ mime: "image/jpeg" }));
  assert.ok(!img.ok);
  if (!img.ok) assert.equal(img.statusDestino, "nao_suportado");
  const link = podeLer(mat({ linkUrl: "https://x", storagePath: null }));
  assert.ok(!link.ok);
  if (!link.ok) assert.equal(link.statusDestino, "nao_suportado");
  const outro = podeLer(mat({ tipo: "foto" }));
  assert.ok(!outro.ok);
  if (!outro.ok) assert.equal(outro.statusDestino, "nao_aplicavel");
});

test("L4 campus: um so resolve sozinho; zero ou varios exigem escolha; pedido tem que ser do fornecedor", () => {
  const um = resolverCampusParaLeitura([{ id: "c1" }]);
  assert.ok(um.ok);
  if (um.ok) assert.equal(um.campusId, "c1");
  assert.ok(!resolverCampusParaLeitura([]).ok);
  assert.ok(!resolverCampusParaLeitura([{ id: "c1" }, { id: "c2" }]).ok);
  const pedido = resolverCampusParaLeitura([{ id: "c1" }, { id: "c2" }], "c2");
  assert.ok(pedido.ok);
  if (pedido.ok) assert.equal(pedido.campusId, "c2");
  assert.ok(!resolverCampusParaLeitura([{ id: "c1" }], "c9").ok); // campus de outro fornecedor
});

test("L5 todo status tem rotulo", () => {
  for (const s of STATUS_LEITURA) assert.ok(STATUS_LEITURA_LABEL[s].length > 0);
});
