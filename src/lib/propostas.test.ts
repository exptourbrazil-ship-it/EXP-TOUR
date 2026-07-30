// Testes do helper puro de propostas. Roda com `npm test` (node --test).
import { test } from "node:test";
import assert from "node:assert/strict";
import { estadoProposta } from "./propostas.ts";

const HOJE = "2026-07-29";

test("enviada dentro da validade -> valida", () => {
  assert.equal(estadoProposta({ status: "enviada", validade: "2026-08-08" }, HOJE), "valida");
  assert.equal(estadoProposta({ status: "enviada", validade: "2026-07-29" }, HOJE), "valida"); // vence hoje ainda vale
});

test("enviada com validade vencida -> expirada", () => {
  assert.equal(estadoProposta({ status: "enviada", validade: "2026-07-28" }, HOJE), "expirada");
});

test("status refletido: cancelada, aceita, indisponivel", () => {
  assert.equal(estadoProposta({ status: "cancelada", validade: "2026-08-08" }, HOJE), "cancelada");
  assert.equal(estadoProposta({ status: "aceita", validade: "2026-07-01" }, HOJE), "aceita");
  assert.equal(estadoProposta({ status: "rascunho", validade: "2026-08-08" }, HOJE), "indisponivel");
});

test("sem validade e enviada -> valida", () => {
  assert.equal(estadoProposta({ status: "enviada", validade: null }, HOJE), "valida");
});
