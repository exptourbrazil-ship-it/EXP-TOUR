import { test } from "node:test";
import assert from "node:assert/strict";
import { tamanhoVisivel, textoParaHtmlSimples } from "./texto-html.ts";

test("linha em branco separa paragrafo; quebra simples vira <br>", () => {
  assert.equal(textoParaHtmlSimples("um\ndois\n\ntres"), "<p>um<br>dois</p><p>tres</p>");
});

test("escapa UMA vez — o & do consultor chega como & na tela", () => {
  const html = textoParaHtmlSimples("Taxa & seguro < 5%");
  assert.equal(html, "<p>Taxa &amp; seguro &lt; 5%</p>");
  // O que o navegador renderiza e o texto original.
  assert.equal(tamanhoVisivel(html), "Taxa & seguro < 5%".length);
});

test("tag digitada pelo consultor vira texto, nao marcacao", () => {
  assert.equal(
    textoParaHtmlSimples("<script>alert(1)</script>"),
    "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>",
  );
});

test("vazio, espacos e quebras sozinhas devolvem string vazia", () => {
  assert.equal(textoParaHtmlSimples(""), "");
  assert.equal(textoParaHtmlSimples("   \n\n  "), "");
  assert.equal(textoParaHtmlSimples("\r\n\r\n"), "");
});

test("CRLF do Windows nao gera paragrafo fantasma", () => {
  assert.equal(textoParaHtmlSimples("um\r\n\r\ndois"), "<p>um</p><p>dois</p>");
});

test("tamanhoVisivel mede o texto, nao a marcacao", () => {
  // O HTML tem 24 caracteres a mais que o texto que o consultor digitou.
  const html = textoParaHtmlSimples("abc\n\ndef");
  assert.ok(html.length > 8);
  assert.equal(tamanhoVisivel(html), "abc\n\ndef".length);
});
