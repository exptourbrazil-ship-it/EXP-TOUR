import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizarEntradaMaterial, linkValido, dataIsoValida, materialVencido, somarDiasISO, resumoMateriais } from "./material-helpers.ts";

test("M1 entrada valida (arquivo, sem link)", () => {
  const r = normalizarEntradaMaterial(
    { tipo: "brochura", titulo: "  Brochura 2026 ", idioma: "PT", permissao: "cliente", programa: "General English", validade: "2026-12-31" },
    { exigirLink: false }
  );
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.dados.titulo, "Brochura 2026");
    assert.equal(r.dados.idioma, "pt");
    assert.equal(r.dados.permissao, "cliente");
    assert.equal(r.dados.validade, "2026-12-31");
    assert.equal(r.dados.linkUrl, null);
  }
});

test("M2 titulo obrigatorio", () => {
  const r = normalizarEntradaMaterial({ tipo: "foto", titulo: "  " }, { exigirLink: false });
  assert.equal(r.ok, false);
});

test("M3 tipo invalido recusado", () => {
  const r = normalizarEntradaMaterial({ tipo: "virus", titulo: "x" }, { exigirLink: false });
  assert.equal(r.ok, false);
});

test("M4 idioma/permissao desconhecidos caem no padrao", () => {
  const r = normalizarEntradaMaterial({ tipo: "logotipo", titulo: "Logo", idioma: "zz", permissao: "publico" }, { exigirLink: false });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.dados.idioma, "en");
    assert.equal(r.dados.permissao, "interno");
  }
});

test("M5 validade invalida recusada", () => {
  const r = normalizarEntradaMaterial({ tipo: "brochura", titulo: "x", validade: "2026-13-40" }, { exigirLink: false });
  assert.equal(r.ok, false);
});

test("M6 link obrigatorio quando exigirLink e valido", () => {
  const semLink = normalizarEntradaMaterial({ tipo: "video", titulo: "Tour" }, { exigirLink: true });
  assert.equal(semLink.ok, false);

  const linkRuim = normalizarEntradaMaterial({ tipo: "video", titulo: "Tour", linkUrl: "javascript:alert(1)" }, { exigirLink: true });
  assert.equal(linkRuim.ok, false);

  const ok = normalizarEntradaMaterial({ tipo: "video", titulo: "Tour", linkUrl: "https://youtu.be/abc" }, { exigirLink: true });
  assert.equal(ok.ok, true);
  if (ok.ok) assert.equal(ok.dados.linkUrl, "https://youtu.be/abc");
});

test("M7 linkValido bloqueia esquemas perigosos", () => {
  assert.equal(linkValido("https://vimeo.com/1"), true);
  assert.equal(linkValido("http://x.com"), true);
  assert.equal(linkValido("javascript:alert(1)"), false);
  assert.equal(linkValido("data:text/html,x"), false);
  assert.equal(linkValido("ftp://x"), false);
  assert.equal(linkValido("nao-e-url"), false);
});

test("M8 dataIsoValida", () => {
  assert.equal(dataIsoValida("2026-02-28"), true);
  assert.equal(dataIsoValida("2026-02-31"), false);
  assert.equal(dataIsoValida("2026-13-01"), false);
});

test("M9 materialVencido", () => {
  assert.equal(materialVencido("2026-01-01", "2026-08-28"), true);
  assert.equal(materialVencido("2026-12-31", "2026-08-28"), false);
  assert.equal(materialVencido(null, "2026-08-28"), false);
});

test("M10 somarDiasISO soma em UTC e cruza mês/ano", () => {
  assert.equal(somarDiasISO("2026-08-28", 30), "2026-09-27");
  assert.equal(somarDiasISO("2026-12-20", 30), "2027-01-19");
  assert.equal(somarDiasISO("2026-13-01", 30), ""); // data inválida
});

test("M11 resumoMateriais conta visibilidade e validade", () => {
  const hoje = "2026-08-28";
  const r = resumoMateriais(
    [
      { permissao: "cliente", validade: null, vencido: false },              // cliente, sem validade
      { permissao: "interno", validade: "2026-09-10", vencido: false },      // interno, vencendo (dentro de 30d)
      { permissao: "cliente", validade: "2026-01-01", vencido: true },       // vencido
      { permissao: "interno", validade: "2027-05-01", vencido: false },      // longe (não vencendo)
      { permissao: "cliente", validade: "2026-08-28", vencido: false },      // vence hoje → vencendo
    ],
    hoje,
    30,
  );
  assert.equal(r.total, 5);
  assert.equal(r.cliente, 3);
  assert.equal(r.interno, 2);
  assert.equal(r.vencidos, 1);
  assert.equal(r.vencendo, 2);
});

test("M11 resumoMateriais lista vazia zera tudo", () => {
  assert.deepEqual(resumoMateriais([], "2026-08-28"), { total: 0, cliente: 0, interno: 0, vencidos: 0, vencendo: 0 });
});
