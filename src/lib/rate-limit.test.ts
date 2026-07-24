// Testes dos helpers puros de rate limiting.
// Roda com o runner nativo do Node: `npm test` (node --test), sem dependencias.
import { test } from "node:test";
import assert from "node:assert/strict";
import { contarDentroDaJanela, excedeuLimite, obterIp } from "./rate-limit.ts";

const AGORA = 1_000_000_000_000; // instante de referencia fixo (ms)
const MIN = 60_000;

test("contarDentroDaJanela conta apenas hits dentro da janela", () => {
  const ts = [AGORA - 30 * MIN, AGORA - 5 * MIN, AGORA - 1 * MIN, AGORA];
  // janela de 10 min -> pega os 3 ultimos (5min, 1min, agora)
  assert.equal(contarDentroDaJanela(ts, AGORA, 10 * MIN), 3);
});

test("contarDentroDaJanela ignora timestamps futuros e antigos", () => {
  const ts = [AGORA - 20 * MIN, AGORA + 5 * MIN];
  assert.equal(contarDentroDaJanela(ts, AGORA, 10 * MIN), 0);
});

test("contarDentroDaJanela com lista vazia retorna 0", () => {
  assert.equal(contarDentroDaJanela([], AGORA, 10 * MIN), 0);
});

test("excedeuLimite bloqueia quando quantidade atinge o limite", () => {
  assert.equal(excedeuLimite(2, 3), false); // 3o request ainda passa
  assert.equal(excedeuLimite(3, 3), true); // 4o request bloqueia
  assert.equal(excedeuLimite(5, 3), true);
});

test("obterIp usa o primeiro IP de x-forwarded-for", () => {
  const req = new Request("https://x", { headers: { "x-forwarded-for": "203.0.113.7, 10.0.0.1" } });
  assert.equal(obterIp(req), "203.0.113.7");
});

test("obterIp cai para x-real-ip e depois para 'desconhecido'", () => {
  const req = new Request("https://x", { headers: { "x-real-ip": "198.51.100.9" } });
  assert.equal(obterIp(req), "198.51.100.9");
  assert.equal(obterIp(new Request("https://x")), "desconhecido");
});
