// Testes do helper de notification_url das cobrancas do Mercado Pago.
// Roda com o runner nativo do Node: `npm test` (node --test), sem dependencias.
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { notificationUrl } from "./mercadopago.ts";

const ORIGINAIS = {
  MP_NOTIFICATION_URL: process.env.MP_NOTIFICATION_URL,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
};

function limpar() {
  delete process.env.MP_NOTIFICATION_URL;
  delete process.env.NEXT_PUBLIC_APP_URL;
}

beforeEach(limpar);

afterEach(() => {
  limpar();
  if (ORIGINAIS.MP_NOTIFICATION_URL) process.env.MP_NOTIFICATION_URL = ORIGINAIS.MP_NOTIFICATION_URL;
  if (ORIGINAIS.NEXT_PUBLIC_APP_URL) process.env.NEXT_PUBLIC_APP_URL = ORIGINAIS.NEXT_PUBLIC_APP_URL;
});

test("deriva a rota do webhook a partir de NEXT_PUBLIC_APP_URL", () => {
  process.env.NEXT_PUBLIC_APP_URL = "https://exp-tour.vercel.app";
  assert.equal(notificationUrl(), "https://exp-tour.vercel.app/api/webhooks/mercadopago");
});

test("tolera barra final em NEXT_PUBLIC_APP_URL", () => {
  process.env.NEXT_PUBLIC_APP_URL = "https://exp-tour.vercel.app/";
  assert.equal(notificationUrl(), "https://exp-tour.vercel.app/api/webhooks/mercadopago");
});

test("MP_NOTIFICATION_URL tem precedencia e e usada como veio", () => {
  process.env.NEXT_PUBLIC_APP_URL = "https://exp-tour.vercel.app";
  process.env.MP_NOTIFICATION_URL = "https://outro-dominio.com/hook";
  assert.equal(notificationUrl(), "https://outro-dominio.com/hook");
});

// O MP recusa criar o pagamento se a notification_url nao for https publica.
// Nesses casos preferimos omitir o campo a quebrar a geracao da cobranca.
test("retorna null sem nenhuma env configurada", () => {
  assert.equal(notificationUrl(), null);
});

test("retorna null para http (nao https)", () => {
  process.env.NEXT_PUBLIC_APP_URL = "http://exp-tour.vercel.app";
  assert.equal(notificationUrl(), null);
});

test("retorna null para localhost, para nao quebrar o ambiente de dev", () => {
  process.env.NEXT_PUBLIC_APP_URL = "https://localhost:3000";
  assert.equal(notificationUrl(), null);
  process.env.NEXT_PUBLIC_APP_URL = "https://127.0.0.1:3000";
  assert.equal(notificationUrl(), null);
});
