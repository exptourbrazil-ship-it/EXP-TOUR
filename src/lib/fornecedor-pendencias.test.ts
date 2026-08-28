// Testes do motor puro de pendencias do Portal do Fornecedor.
// Roda com o runner nativo do Node: `npm test` (node --test), sem dependencias.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  derivarPendencias,
  diasDesde,
  contarPorSeveridade,
  CONFIG_PENDENCIAS_PADRAO,
  type ContratoPendencia,
} from "./fornecedor-pendencias.ts";

const HOJE = "2026-08-28";

function contrato(over: Partial<ContratoPendencia> = {}): ContratoPendencia {
  return {
    contratoId: "c1",
    estudanteNome: "Aluno X",
    canceladoEm: null,
    criadoEm: "2026-08-27", // 1 dia atras (recente)
    documentos: [],
    ...over,
  };
}

test("diasDesde conta dias inteiros e trata data-only", () => {
  assert.equal(diasDesde("2026-08-21", HOJE), 7);
  assert.equal(diasDesde("2026-08-28", HOJE), 0);
  assert.equal(diasDesde(null, HOJE), null);
  assert.equal(diasDesde("lixo", HOJE), null);
});

test("LOA pendente: sem carta_aceite gera a pendencia; severidade escala com a idade", () => {
  // Recente (1 dia) -> info
  const recente = derivarPendencias(HOJE, [contrato({ criadoEm: "2026-08-27" })]);
  const loaRecente = recente.find((p) => p.tipo === "loa_pendente");
  assert.ok(loaRecente);
  assert.equal(loaRecente!.severidade, "info");
  assert.equal(loaRecente!.prazoDias, CONFIG_PENDENCIAS_PADRAO.loaPrazoDias);

  // D+3 -> atencao
  const d3 = derivarPendencias(HOJE, [contrato({ criadoEm: "2026-08-25" })]);
  assert.equal(d3.find((p) => p.tipo === "loa_pendente")!.severidade, "atencao");

  // D+7 -> urgente
  const d7 = derivarPendencias(HOJE, [contrato({ criadoEm: "2026-08-21" })]);
  assert.equal(d7.find((p) => p.tipo === "loa_pendente")!.severidade, "urgente");
});

test("LOA: com carta_aceite NAO gera pendencia de LOA", () => {
  const p = derivarPendencias(HOJE, [
    contrato({ documentos: [{ tipo: "carta_aceite", origem: "fornecedor", status: "recebido", compartilhado: false }] }),
  ]);
  assert.equal(p.some((x) => x.tipo === "loa_pendente"), false);
});

test("Documento devolvido: doc da escola rejeitado -> urgente (um por doc)", () => {
  const p = derivarPendencias(HOJE, [
    contrato({
      criadoEm: "2026-08-01", // antigo, para nao gerar nova_matricula
      documentos: [
        { tipo: "carta_aceite", origem: "fornecedor", status: "rejeitado", compartilhado: false },
        { tipo: "coe", origem: "fornecedor", status: "rejeitado", compartilhado: false },
        { tipo: "coe", origem: "admin", status: "rejeitado", compartilhado: false }, // nao e da escola
      ],
    }),
  ]);
  const devolvidos = p.filter((x) => x.tipo === "documento_devolvido");
  assert.equal(devolvidos.length, 2);
  assert.equal(devolvidos[0].severidade, "urgente");
});

test("Docs de viagem: visto aprovado E compartilhado -> pendencia info; sem compartilhar, nao", () => {
  const comp = derivarPendencias(HOJE, [
    contrato({
      criadoEm: "2026-08-01",
      documentos: [
        { tipo: "carta_aceite", origem: "admin", status: "aprovado", compartilhado: false }, // silencia LOA
        { tipo: "visto", origem: "admin", status: "aprovado", compartilhado: true },
      ],
    }),
  ]);
  assert.equal(comp.some((x) => x.tipo === "docs_viagem"), true);

  const naoComp = derivarPendencias(HOJE, [
    contrato({
      criadoEm: "2026-08-01",
      documentos: [
        { tipo: "carta_aceite", origem: "admin", status: "aprovado", compartilhado: false },
        { tipo: "visto", origem: "admin", status: "aprovado", compartilhado: false },
      ],
    }),
  ]);
  assert.equal(naoComp.some((x) => x.tipo === "docs_viagem"), false);
});

test("Nova matricula: dentro da janela gera; fora nao", () => {
  const dentro = derivarPendencias(HOJE, [contrato({ criadoEm: "2026-08-25" })]);
  assert.equal(dentro.some((x) => x.tipo === "nova_matricula"), true);

  const fora = derivarPendencias(HOJE, [contrato({ criadoEm: "2026-08-10" })]);
  assert.equal(fora.some((x) => x.tipo === "nova_matricula"), false);
});

test("Contrato cancelado nao gera nenhuma pendencia", () => {
  const p = derivarPendencias(HOJE, [
    contrato({ canceladoEm: "2026-08-20", documentos: [{ tipo: "coe", origem: "fornecedor", status: "rejeitado", compartilhado: false }] }),
  ]);
  assert.equal(p.length, 0);
});

test("Ordenacao: urgente antes de info; contadores por severidade", () => {
  const p = derivarPendencias(HOJE, [
    contrato({ contratoId: "cA", criadoEm: "2026-08-27" }), // LOA info + nova_matricula info
    contrato({
      contratoId: "cB",
      criadoEm: "2026-08-01",
      documentos: [{ tipo: "coe", origem: "fornecedor", status: "rejeitado", compartilhado: false }], // devolvido urgente + LOA urgente
    }),
  ]);
  assert.equal(p[0].severidade, "urgente");
  const cont = contarPorSeveridade(p);
  assert.equal(cont.urgente, 2); // devolvido + LOA(D+27)
  assert.ok(cont.info >= 2);
});
