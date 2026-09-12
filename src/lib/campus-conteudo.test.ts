import { test } from "node:test";
import assert from "node:assert/strict";
import { validarCampusContentPayload } from "./campus-conteudo.ts";

test("campus: payload válido normaliza (content/media/amenities/accred/nacionalidade)", () => {
  const r = validarCampusContentPayload({
    content: [
      { locale: "pt-BR", description_html: "<p>Escola ótima</p>", highlights: "Turmas pequenas\nStaff diverso", highlights_footer: "Rodapé", is_machine_translated: false },
      { locale: "en", description_html: "Great school", is_machine_translated: true },
    ],
    media: [
      { url: "https://ex.com/1.jpg", kind: "photo", caption: "Fachada" },
      { url: "https://ex.com/b.pdf", kind: "brochure" },
    ],
    amenities: "Wi-Fi\nCafeteria\nLounge",
    accreditations: ["IALC", "Languages Canada"],
    nationalityMix: [{ pais: "Brasil", percentual: 20 }, { country: "Japão", percent: "15" }],
  });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.valor.content.length, 2);
  assert.deepEqual(r.valor.content[0].highlights, ["Turmas pequenas", "Staff diverso"]);
  assert.equal(r.valor.content[0].highlights_footer, "Rodapé");
  assert.equal(r.valor.media.length, 2);
  assert.equal(r.valor.media[0].kind, "photo");
  assert.equal(r.valor.media[1].kind, "brochure");
  assert.deepEqual(r.valor.amenities, ["Wi-Fi", "Cafeteria", "Lounge"]);
  assert.deepEqual(r.valor.accreditations, ["IALC", "Languages Canada"]);
  assert.equal(r.valor.nationalityMix.length, 2);
  assert.deepEqual(r.valor.nationalityMix[1], { pais: "Japão", percentual: 15 });
});

test("campus: vazio é válido", () => {
  const r = validarCampusContentPayload({});
  assert.ok(r.ok && r.valor.content.length === 0 && r.valor.media.length === 0 && r.valor.amenities.length === 0);
});

test("campus: locale vazio é descartado; locale inválido/duplicado falha", () => {
  const r = validarCampusContentPayload({
    content: [{ locale: "pt-BR", description_html: "", highlights: [], highlights_footer: "" }, { locale: "en", description_html: "hi" }],
  });
  assert.ok(r.ok && r.valor.content.length === 1 && r.valor.content[0].locale === "en");
  const inv = validarCampusContentPayload({ content: [{ locale: "fr", description_html: "x" }] });
  assert.ok(!inv.ok && inv.falhas.some((f) => f.campo.includes("locale")));
  const dup = validarCampusContentPayload({ content: [{ locale: "pt-BR", description_html: "a" }, { locale: "pt-BR", description_html: "b" }] });
  assert.ok(!dup.ok && dup.falhas.some((f) => f.campo.includes("locale")));
});

test("campus: HTML perigoso e URL não-http falham", () => {
  const bad = validarCampusContentPayload({ content: [{ locale: "pt-BR", description_html: "<script>x</script>" }] });
  assert.ok(!bad.ok && bad.falhas.some((f) => f.campo.includes("description_html")));
  const badUrl = validarCampusContentPayload({ media: [{ url: "javascript:alert(1)" }] });
  assert.ok(!badUrl.ok && badUrl.falhas.some((f) => f.campo.includes("media[0].url")));
});

test("campus: percentual de nacionalidade fora de 0-100 falha", () => {
  const r = validarCampusContentPayload({ nationalityMix: [{ pais: "X", percentual: 150 }] });
  assert.ok(!r.ok && r.falhas.some((f) => f.campo.includes("nationalityMix")));
});
