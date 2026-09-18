import { test } from "node:test";
import assert from "node:assert/strict";
import { extensaoDeMime, ehUrlInterna, validarUrlExterna, caminhoStorageMidia, urlPublicaStorage, resumirErro, ipEhPrivado, numeroEnv } from "./midia-internalizacao.ts";

const SUPA = "https://lvchpskxeohfmistppxl.supabase.co";

test("extensaoDeMime: aceita imagens comuns, recusa o resto", () => {
  assert.equal(extensaoDeMime("image/jpeg"), "jpg");
  assert.equal(extensaoDeMime("image/png; charset=binary"), "png");
  assert.equal(extensaoDeMime("IMAGE/WEBP"), "webp");
  assert.equal(extensaoDeMime("text/html; charset=utf-8"), null);
  assert.equal(extensaoDeMime("application/pdf"), null);
  assert.equal(extensaoDeMime("image/svg+xml"), null, "SVG recusado (conteudo ativo)");
  assert.equal(extensaoDeMime(null), null);
});

test("ehUrlInterna: so o Storage do nosso projeto", () => {
  assert.equal(ehUrlInterna(`${SUPA}/storage/v1/object/public/midia-catalogo/campus/a/b.jpg`, SUPA), true);
  assert.equal(ehUrlInterna(`${SUPA}/storage/v1/object/public/x.jpg`, `${SUPA}/`), true);
  assert.equal(ehUrlInterna("https://www.lsi.edu/img/x.jpg", SUPA), false);
  assert.equal(ehUrlInterna("https://outro.supabase.co/storage/v1/object/public/x.jpg", SUPA), false);
});

test("validarUrlExterna: https publico passa; interno/IP/credencial nao", () => {
  assert.equal(validarUrlExterna("https://cdn.sanity.io/images/a.jpg").ok, true);
  for (const ruim of [
    "http://www.lsi.edu/a.jpg",
    "https://user:pw@www.lsi.edu/a.jpg",
    "https://127.0.0.1/a.jpg",
    "https://10.0.0.5/a.jpg",
    "https://[::1]/a.jpg",
    "https://localhost/a.jpg",
    "https://db.internal/a.jpg",
    "https://meu.local/a.jpg",
    "ftp://x/a.jpg",
    "nao-e-url",
  ]) {
    assert.equal(validarUrlExterna(ruim).ok, false, ruim);
  }
});

test("caminho/URL publica sao deterministicos", () => {
  const c = caminhoStorageMidia("campus-1", "media-9", "jpg");
  assert.equal(c, "campus/campus-1/media-9.jpg");
  assert.equal(urlPublicaStorage(`${SUPA}/`, "midia-catalogo", c), `${SUPA}/storage/v1/object/public/midia-catalogo/${c}`);
});

test("resumirErro: tira URLs e corta", () => {
  assert.equal(resumirErro("falhou https://a.b/c?x=1 (404)"), "falhou <url> (404)");
  assert.equal(resumirErro("x".repeat(500)).length, 200);
});

test("ipEhPrivado: faixas privadas/link-local/loopback; publico passa", () => {
  for (const p of ["10.0.0.5", "127.0.0.1", "169.254.169.254", "172.16.0.1", "172.31.255.255", "192.168.1.1", "100.64.0.1", "0.0.0.0", "224.0.0.1", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1"]) {
    assert.equal(ipEhPrivado(p), true, p);
  }
  for (const p of ["8.8.8.8", "172.32.0.1", "104.18.2.3", "2606:4700::6812:203", "::ffff:8.8.8.8"]) {
    assert.equal(ipEhPrivado(p), false, p);
  }
});

test("numeroEnv: aceita positivo finito, senao default", () => {
  assert.equal(numeroEnv("30", 5), 30);
  assert.equal(numeroEnv("abc", 5), 5);
  assert.equal(numeroEnv("-1", 5), 5);
  assert.equal(numeroEnv(undefined, 5), 5);
});
