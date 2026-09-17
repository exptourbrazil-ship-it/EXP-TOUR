// Testes da parte PURA da extracao de disponibilidade (F3.4). `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizarDisponibilidadeExtraida, contarItensDisponibilidade, planejarDisponibilidade, avisosDoPlano } from "./disponibilidade-extract.ts";

test("D1 normalizar: datas ISO validas ordenadas e sem duplicata; status whitelist; descarta sem nome ou sem datas/regra", () => {
  const d = normalizarDisponibilidadeExtraida({
    intakes: [
      { programa: "General English", datas: ["2026-02-02", "2026-01-05", "2026-01-05", "05/01/2026", "2026-02-30"], status: "OPEN", vagas: "12" },
      { programa: "", datas: ["2026-01-05"] },
      { programa: "IELTS", regra: "every Monday", status: "weird" },
      { programa: "Nada", datas: [] },
    ],
    periodos: [
      { acomodacao: "Homestay", inicio: "2026-01-01", fim: "2025-12-01", status: "on_request" }, // fim antes do inicio -> null
      { acomodacao: "Residence", inicio: "x" },
    ],
  });
  assert.equal(d.intakes.length, 2);
  assert.deepEqual(d.intakes[0].datas, ["2026-01-05", "2026-02-02"]);
  assert.equal(d.intakes[0].status, "open");
  assert.equal(d.intakes[0].vagas, 12);
  assert.equal(d.intakes[1].regra, "every Monday");
  assert.equal(d.intakes[1].status, null);
  assert.equal(d.periodos.length, 1);
  assert.equal(d.periodos[0].fim, null);
  assert.equal(contarItensDisponibilidade(d), 2 + 1 + 1);
});

const casamento = {
  programas: { "General English": { id: "p1", name: "General English", score: 1 }, IELTS: null },
  acomodacoes: { Homestay: { id: "a1", name: "Homestay Single", score: 0.67 } },
};

test("D2 planejar: criar / alterar / igual contra o publicado; data passada marcada; regra e sem-produto separados", () => {
  const d = normalizarDisponibilidadeExtraida({
    intakes: [
      { programa: "General English", datas: ["2026-01-05", "2026-02-02", "2026-03-02"], status: "open" },
      { programa: "IELTS", datas: ["2026-01-05"] },
      { programa: "General English", regra: "every Monday" },
    ],
    periodos: [{ acomodacao: "Homestay", inicio: "2026-06-01", fim: "2026-08-31", status: "closed" }],
  });
  const plano = planejarDisponibilidade(
    d,
    casamento,
    {
      intakes: { p1: [{ startDate: "2026-02-02", status: "open", capacity: null }, { startDate: "2026-03-02", status: "closed", capacity: 10, notes: "turma da tarde" }] },
      periodos: { a1: [{ periodStart: "2026-06-01", periodEnd: "2026-08-31", status: "open", notes: "sem café" }] },
    },
    "2026-01-20",
  );
  const porChave = Object.fromEntries(plano.itens.map((i) => [i.chave, i]));
  assert.equal(porChave["intake:p1:2026-01-05"].acao, "criar");
  assert.equal(porChave["intake:p1:2026-01-05"].passada, true); // 05/01 < hoje 20/01
  assert.equal(porChave["intake:p1:2026-02-02"].acao, "igual");
  assert.equal(porChave["intake:p1:2026-03-02"].acao, "alterar"); // closed -> open
  assert.equal(porChave["intake:p1:2026-03-02"].atual?.status, "closed");
  assert.equal((porChave["intake:p1:2026-03-02"] as any).capacity, 10); // sem vagas no doc: mantem as atuais
  assert.equal(porChave["intake:p1:2026-03-02"].notes, "turma da tarde"); // sem observacao no doc: mantem a atual (M1)
  assert.equal((porChave["periodo:a1:2026-06-01"] as any).periodEnd, "2026-08-31");
  assert.equal(porChave["periodo:a1:2026-06-01"].notes, "sem café");
  assert.equal(porChave["periodo:a1:2026-06-01"].acao, "alterar"); // open -> closed
  assert.deepEqual(plano.semProduto, ["IELTS"]);
  assert.equal(plano.regras.length, 1);
  const av = avisosDoPlano(plano);
  assert.ok(av.some((a) => a.includes("hoje está \"closed\"")));
  assert.ok(av.some((a) => a.includes("já passaram")));
  assert.ok(av.some((a) => a.includes("every Monday")));
  assert.ok(av.some((a) => a.includes("IELTS")));
});

test("D3 planejar: mesma data duas vezes vira um item; status ausente = open", () => {
  const d = normalizarDisponibilidadeExtraida({ intakes: [{ programa: "General English", datas: ["2026-05-04"] }, { programa: "General English", datas: ["2026-05-04"], status: "limited" }] });
  const plano = planejarDisponibilidade(d, casamento, { intakes: {}, periodos: {} }, "2026-01-01");
  assert.equal(plano.itens.length, 1);
  assert.equal(plano.itens[0].status, "open");
});
