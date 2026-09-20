import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRedes, urlDaRede, urlFavicon } from "./redes-sociais.ts";

test("aceita o perfil da propria rede, com ou sem www", () => {
  assert.equal(urlDaRede("instagram", "https://instagram.com/lsi"), "https://instagram.com/lsi");
  assert.equal(urlDaRede("instagram", "https://www.instagram.com/lsi"), "https://www.instagram.com/lsi");
});

test("RECUSA url de outro host sob o icone da rede", () => {
  // O ponto do modulo: o icone do Instagram nao pode levar para outro lugar.
  assert.equal(urlDaRede("instagram", "https://evil.example.com/lsi"), null);
  assert.equal(urlDaRede("instagram", "https://instagram.com.evil.example/lsi"), null);
  assert.equal(urlDaRede("facebook", "https://instagram.com/lsi"), null);
});

test("subdominio da propria rede passa (br.linkedin.com)", () => {
  assert.equal(urlDaRede("linkedin", "https://br.linkedin.com/school/lsi"), "https://br.linkedin.com/school/lsi");
});

test("recusa protocolo que nao seja http/https", () => {
  assert.equal(urlDaRede("instagram", "javascript:alert(1)"), null);
  assert.equal(urlDaRede("instagram", "data:text/html,<script>"), null);
  assert.equal(urlDaRede("instagram", "ftp://instagram.com/lsi"), null);
});

test("host da rede sem caminho nao e perfil", () => {
  assert.equal(urlDaRede("instagram", "https://instagram.com"), null);
  assert.equal(urlDaRede("instagram", "https://instagram.com/"), null);
});

test("x aceita x.com e twitter.com", () => {
  assert.ok(urlDaRede("x", "https://x.com/lsi"));
  assert.ok(urlDaRede("x", "https://twitter.com/lsi"));
});

test("youtube aceita youtu.be", () => {
  assert.ok(urlDaRede("youtube", "https://youtu.be/abc123"));
});

test("parseRedes descarta invalidas, repetidas e desconhecidas", () => {
  const out = parseRedes([
    { rede: "instagram", url: "https://instagram.com/a" },
    { rede: "instagram", url: "https://instagram.com/b" }, // repetida: fica a 1a
    { rede: "orkut", url: "https://orkut.com/a" }, // rede desconhecida
    { rede: "facebook", url: "nao-e-url" },
    { rede: "youtube", url: "https://youtube.com/@escola" },
  ]);
  assert.deepEqual(out, [
    { rede: "instagram", url: "https://instagram.com/a" },
    { rede: "youtube", url: "https://youtube.com/@escola" },
  ]);
});

test("parseRedes ordena pela ordem de exibicao, nao pela de gravacao", () => {
  const out = parseRedes([
    { rede: "x", url: "https://x.com/e" },
    { rede: "instagram", url: "https://instagram.com/e" },
    { rede: "facebook", url: "https://facebook.com/e" },
  ]);
  assert.deepEqual(out.map((r) => r.rede), ["instagram", "facebook", "x"]);
});

test("parseRedes tolera lixo sem quebrar", () => {
  assert.deepEqual(parseRedes(null), []);
  assert.deepEqual(parseRedes("nao e array"), []);
  assert.deepEqual(parseRedes([null, 42, "x", {}]), []);
});

test("favicon aceita qualquer host http/https e recusa o resto", () => {
  assert.equal(urlFavicon("https://www.lsi.edu/favicon.ico"), "https://www.lsi.edu/favicon.ico");
  assert.equal(urlFavicon("javascript:alert(1)"), null);
  assert.equal(urlFavicon(""), null);
  assert.equal(urlFavicon(null), null);
});
