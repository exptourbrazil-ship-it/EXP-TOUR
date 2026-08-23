// Testes da validacao pura do coorte de forca maior (E8).
import { test } from "node:test";
import assert from "node:assert/strict";
import { dataISOValida, periodoValido, destinoValido } from "./forca-maior.ts";

test("dataISOValida", () => {
  assert.equal(dataISOValida("2026-08-23"), true);
  assert.equal(dataISOValida("2026-02-29"), false); // 2026 nao e bissexto
  assert.equal(dataISOValida("2024-02-29"), true); // bissexto
  assert.equal(dataISOValida("2026-13-01"), false);
  assert.equal(dataISOValida("2026-00-10"), false);
  assert.equal(dataISOValida("2026-8-1"), false); // sem zero-pad
  assert.equal(dataISOValida("23/08/2026"), false);
  assert.equal(dataISOValida(""), false);
  assert.equal(dataISOValida(null), false);
});

test("periodoValido: ambos ausentes = aberto; ordem importa", () => {
  assert.equal(periodoValido(), true);
  assert.equal(periodoValido(null, null), true);
  assert.equal(periodoValido("2026-01-01", null), true);
  assert.equal(periodoValido(null, "2026-12-31"), true);
  assert.equal(periodoValido("2026-01-01", "2026-12-31"), true);
  assert.equal(periodoValido("2026-12-31", "2026-01-01"), false); // de > ate
  assert.equal(periodoValido("lixo", "2026-01-01"), false);
  assert.equal(periodoValido("2026-01-01", "lixo"), false);
  assert.equal(periodoValido("2026-05-05", "2026-05-05"), true); // mesmo dia
});

test("destinoValido: nao vazio, tamanho sao", () => {
  assert.equal(destinoValido("canada"), true);
  assert.equal(destinoValido("eua"), true);
  assert.equal(destinoValido("a"), false); // curto demais (evita filtro amplo)
  assert.equal(destinoValido(""), false);
  assert.equal(destinoValido("   "), false);
  assert.equal(destinoValido(null), false);
  assert.equal(destinoValido("x".repeat(65)), false);
});
