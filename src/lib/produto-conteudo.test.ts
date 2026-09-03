// Testes do motor puro de validacao de conteudo/midia de produto.
// Roda com o runner nativo do Node: `npm test` (node --test), sem dependencias.
import { test } from "node:test";
import assert from "node:assert/strict";
import { validarConteudoProduto, type Falha } from "./produto-conteudo.ts";

function campos(r: ReturnType<typeof validarConteudoProduto>): string[] {
  return r.ok ? [] : r.falhas.map((f: Falha) => f.campo);
}

test("conteúdo + mídia válidos normalizam", () => {
  const r = validarConteudoProduto({
    product_id: "prod-1",
    content: [
      { locale: "pt-BR", description_html: "<p>Curso</p>", highlights: ["Aulas", "Certificado"], inclusions: "Material\nCoffee", is_machine_translated: false },
      { locale: "en", description_html: "<p>Course</p>", is_machine_translated: true },
    ],
    media: [{ url: "https://x.com/a.jpg", kind: "image", caption: "Fachada" }],
  });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.valor.content.length, 2);
  assert.deepEqual(r.valor.content[0].highlights, ["Aulas", "Certificado"]);
  assert.deepEqual(r.valor.content[0].inclusions, ["Material", "Coffee"]); // string -> lista por linha
  assert.equal(r.valor.content[1].is_machine_translated, true);
  assert.equal(r.valor.media[0].url, "https://x.com/a.jpg");
  assert.equal(r.valor.media[0].sort, 0);
});

test("conjunto vazio é válido (produto sem ficha)", () => {
  const r = validarConteudoProduto({ product_id: "p", content: [], media: [] });
  assert.ok(r.ok && r.valor.content.length === 0 && r.valor.media.length === 0);
});

test("product_id obrigatório", () => {
  assert.ok(campos(validarConteudoProduto({ content: [], media: [] })).includes("product_id"));
});

test("locale inválido falha; locale duplicado falha", () => {
  assert.ok(campos(validarConteudoProduto({ product_id: "p", content: [{ locale: "fr", description_html: "x" }] })).some((c) => c.includes("locale")));
  const dup = validarConteudoProduto({ product_id: "p", content: [{ locale: "pt-BR", description_html: "a" }, { locale: "pt-BR", description_html: "b" }] });
  assert.ok(!dup.ok && campos(dup).some((c) => c.includes("locale")));
});

test("locale sem nenhum conteúdo é descartado (não grava linha vazia)", () => {
  const r = validarConteudoProduto({
    product_id: "p",
    content: [{ locale: "pt-BR", description_html: "", highlights: [], inclusions: [], exclusions: [] }, { locale: "en", description_html: "hi" }],
  });
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.valor.content.length, 1);
    assert.equal(r.valor.content[0].locale, "en");
  }
});

test("mídia: URL obrigatória e precisa ser http/https", () => {
  assert.ok(campos(validarConteudoProduto({ product_id: "p", media: [{ caption: "sem url" }] })).some((c) => c.includes("media[0].url")));
  assert.ok(campos(validarConteudoProduto({ product_id: "p", media: [{ url: "javascript:alert(1)" }] })).some((c) => c.includes("media[0].url")));
  assert.ok(campos(validarConteudoProduto({ product_id: "p", media: [{ url: "/local/foto.jpg" }] })).some((c) => c.includes("media[0].url")));
  const ok = validarConteudoProduto({ product_id: "p", media: [{ url: "http://x.com/a.png" }] });
  assert.ok(ok.ok);
});

test("mídia: sort default = índice; preservado quando informado", () => {
  const r = validarConteudoProduto({
    product_id: "p",
    media: [{ url: "https://x.com/1.jpg" }, { url: "https://x.com/2.jpg", sort: 5 }],
  });
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.valor.media[0].sort, 0);
    assert.equal(r.valor.media[1].sort, 5);
  }
});

test("bullets: array e string por linha; vazios filtrados", () => {
  const r = validarConteudoProduto({
    product_id: "p",
    content: [{ locale: "pt-BR", highlights: ["  A  ", "", "B"], exclusions: "X\n\n Y " }],
  });
  assert.ok(r.ok);
  if (r.ok) {
    assert.deepEqual(r.valor.content[0].highlights, ["A", "B"]);
    assert.deepEqual(r.valor.content[0].exclusions, ["X", "Y"]);
  }
});

test("corpo não-objeto falha limpo", () => {
  assert.ok(!validarConteudoProduto(null).ok);
  assert.ok(!validarConteudoProduto([]).ok);
});
