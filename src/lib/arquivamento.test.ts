import { test } from "node:test";
import assert from "node:assert/strict";
import {
  selecionarInativos,
  mensagemBloqueioPacotes,
  resumoDoLote,
  pacotesBloqueantes,
  tabelaVigente,
  produtosSemTabelaAposArquivar,
} from "./arquivamento.ts";

const P = (id: string, kind: string, status: string) => ({ id, kind, name: id, status });

test("selecionarInativos filtra por status/kind e põe pacotes primeiro", () => {
  const r = selecionarInativos([P("a", "program", "inactive"), P("b", "program", "active"), P("c", "package", "inactive"), P("d", "accommodation", "inactive")]);
  assert.deepEqual(r.map((x) => x.id), ["c", "a", "d"]);
  assert.deepEqual(selecionarInativos([P("a", "program", "inactive"), P("d", "accommodation", "inactive")], "program").map((x) => x.id), ["a"]);
});

test("mensagemBloqueioPacotes lista nomes sem duplicar e trunca", () => {
  assert.match(mensagemBloqueioPacotes("X", ["Pac A", "Pac A"]), /um pacote em uso \(Pac A\)/);
  assert.match(mensagemBloqueioPacotes("X", ["1", "2", "3", "4", "5", "6", "7"]), /7 pacotes.*e mais 2/);
});

test("resumoDoLote mostra campus e corta em 5", () => {
  const r = resumoDoLote(Array.from({ length: 7 }, (_, i) => ({ name: `N${i}`, campusName: "Toronto" })));
  assert.equal(r.length, 6);
  assert.equal(r[0], "N0 — Toronto");
  assert.equal(r[5], "… e mais 2");
});

test("pacotesBloqueantes ignora pacote arquivado e pacotes do próprio lote", () => {
  const vivos = new Map([["pk1", "Pacote 1"]]);
  const v = [
    { item_product_id: "i1", package_product_id: "pk1" },
    { item_product_id: "i1", package_product_id: "pkArq" },
    { item_product_id: "i2", package_product_id: "pk1" },
  ];
  const r = pacotesBloqueantes(["i1"], v, vivos);
  assert.deepEqual(r.get("i1"), ["Pacote 1"]);
  assert.equal(r.has("i2"), false);
  assert.equal(pacotesBloqueantes(["i1"], v, vivos, new Set(["pk1"])).size, 0);
});

test("tabelaVigente respeita status e janela", () => {
  const t = { id: "t", status: "active", valid_from: "2026-01-01", valid_until: "2026-12-31" };
  assert.equal(tabelaVigente(t, "2026-10-07"), true);
  assert.equal(tabelaVigente(t, "2027-01-01"), false);
  assert.equal(tabelaVigente({ ...t, status: "expired" }, "2026-10-07"), false);
  assert.equal(tabelaVigente({ ...t, valid_until: null }, "2030-01-01"), true);
});

test("produtosSemTabelaAposArquivar avisa só produto ativo sem outra vigente", () => {
  const t1 = { id: "t1", status: "active", valid_from: "2026-01-01", valid_until: null };
  const t2 = { id: "t2", status: "active", valid_from: "2026-01-01", valid_until: null };
  const mapa = new Map([["p1", [t1]], ["p2", [t1, t2]], ["p3", [t1]]]);
  const r = produtosSemTabelaAposArquivar(
    "t1",
    [{ id: "p1", name: "P1", status: "active" }, { id: "p2", name: "P2", status: "active" }, { id: "p3", name: "P3", status: "inactive" }],
    mapa,
    "2026-10-07",
  );
  assert.deepEqual(r, ["P1"]);
});

import { motivoRecusaLote, executarLote, MOTIVO_REATIVADO } from "./arquivamento.ts";

test("motivoRecusaLote recusa produto reativado", () => {
  assert.equal(motivoRecusaLote("inactive"), null);
  assert.equal(motivoRecusaLote("active"), MOTIVO_REATIVADO);
  assert.equal(motivoRecusaLote("draft"), MOTIVO_REATIVADO);
});

test("executarLote: pacote que falhou continua bloqueando o item; pacote arquivado libera", async () => {
  const lote = [
    { id: "pkOk", kind: "package", name: "PkOk" },
    { id: "pkFalha", kind: "package", name: "PkFalha" },
    { id: "i1", kind: "program", name: "I1" }, // item de pkOk
    { id: "i2", kind: "program", name: "I2" }, // item de pkFalha
  ];
  const donoDe: Record<string, string> = { i1: "pkOk", i2: "pkFalha" };
  const r = await executarLote(
    lote,
    async (p, arq) => {
      if (p.id === "pkFalha") throw new Error("falhou");
      const dono = donoDe[p.id];
      if (dono && !arq.has(dono)) throw new Error("bloqueado por " + dono);
    },
    (e) => (e as Error).message,
  );
  assert.deepEqual(r.arquivadosIds, ["pkOk", "i1"]);
  assert.deepEqual(r.ignorados.map((i) => i.id), ["pkFalha", "i2"]);
  assert.equal(r.ignorados[1].motivo, "bloqueado por pkFalha");
});
