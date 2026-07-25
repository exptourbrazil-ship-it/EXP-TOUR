// Testes dos helpers puros do checklist de pre-embarque. `npm test` (node --test).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  montarChecklist,
  chavesDeTarefa,
  itemDocumentoConcluido,
  resolverConcluido,
  calcularProgresso,
  CHECKLIST_BASE,
} from "./embarque.ts";

test("montarChecklist sem destino retorna apenas a base", () => {
  assert.deepEqual(montarChecklist(null), CHECKLIST_BASE);
  assert.deepEqual(montarChecklist(undefined), CHECKLIST_BASE);
  assert.deepEqual(montarChecklist("destino_inexistente"), CHECKLIST_BASE);
});

test("montarChecklist com destino adiciona os itens de visto do destino", () => {
  // Canada exige dois vistos: estudo canadense + B1/B2 (transito pelos EUA).
  const ca = montarChecklist("canada");
  assert.equal(ca.length, CHECKLIST_BASE.length + 2);
  assert.ok(ca.some((i) => i.chave === "visto_canada"));
  assert.ok(ca.some((i) => i.chave === "visto_eua_transito"));

  const nz = montarChecklist("nova_zelandia");
  assert.equal(nz.length, CHECKLIST_BASE.length + 1);
  assert.ok(nz.some((i) => i.chave === "visto_nz"));
});

test("chavesDeTarefa contem so tarefas manuais, nunca itens de documento", () => {
  const chaves = chavesDeTarefa();
  assert.ok(chaves.has("malas"));
  assert.ok(chaves.has("chip_roaming"));
  assert.ok(!chaves.has("passaporte")); // documento, nao tarefa
  assert.ok(!chaves.has("visto_canada")); // documento, nao tarefa
});

test("itemDocumentoConcluido marca quando qualquer tipo aceito esta presente", () => {
  const visto = { chave: "visto_canada", label: "", tipo: "documento" as const, tiposDocumento: ["visto", "eta"] };
  assert.equal(itemDocumentoConcluido(visto, new Set(["eta"])), true);
  assert.equal(itemDocumentoConcluido(visto, new Set(["passaporte"])), false);
  assert.equal(itemDocumentoConcluido(visto, new Set()), false);
});

test("resolverConcluido: documento vem do cofre; tarefa vem das marcacoes", () => {
  const passaporte = CHECKLIST_BASE.find((i) => i.chave === "passaporte")!;
  const malas = CHECKLIST_BASE.find((i) => i.chave === "malas")!;
  assert.equal(resolverConcluido(passaporte, new Set(["passaporte"]), new Set()), true);
  assert.equal(resolverConcluido(passaporte, new Set(), new Set()), false);
  assert.equal(resolverConcluido(malas, new Set(), new Set(["malas"])), true);
  assert.equal(resolverConcluido(malas, new Set(), new Set()), false);
});

test("calcularProgresso conta documentos presentes e tarefas marcadas", () => {
  const itens = montarChecklist("canada"); // 10 base + 2 vistos = 12
  const tiposPresentes = new Set(["passaporte", "passagem_aerea"]); // 2 docs
  const tarefas = new Set(["malas"]); // 1 tarefa
  const p = calcularProgresso(itens, tiposPresentes, tarefas);
  assert.equal(p.total, 12);
  assert.equal(p.concluidos, 3);
  assert.equal(p.percentual, Math.round((3 / 12) * 100));
});
