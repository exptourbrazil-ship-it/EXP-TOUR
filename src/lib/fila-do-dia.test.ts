// Testes dos helpers puros da Fila do Dia. Roda com `npm test` (node --test).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  idadeEmDias,
  diasDeAtraso,
  entrouEmCobrancaHumana,
  estadoPrazo,
  ordenarFila,
  papelVeCategoria,
  podeVerItem,
  filtrarPorPapel,
  filtrarMinhas,
  contarMinhas,
  DIAS_COBRANCA_HUMANA,
  type ItemFila,
} from "./fila-do-dia.ts";

const AGORA = Date.parse("2026-08-21T12:00:00Z");

test("idadeEmDias: dias inteiros ate agora, nunca negativa", () => {
  assert.equal(idadeEmDias("2026-08-18T12:00:00Z", AGORA), 3);
  assert.equal(idadeEmDias("2026-08-21T00:00:00Z", AGORA), 0);
  assert.equal(idadeEmDias("2026-09-01T00:00:00Z", AGORA), 0); // futuro -> 0
  assert.equal(idadeEmDias("nao-e-data", AGORA), 0);
});

test("diasDeAtraso: calendario UTC, positivo quando vencida", () => {
  assert.equal(diasDeAtraso("2026-08-01", "2026-08-11"), 10);
  assert.equal(diasDeAtraso("2026-08-21", "2026-08-21"), 0); // vence hoje
  assert.equal(diasDeAtraso("2026-08-25", "2026-08-21"), -4); // ainda vai vencer
});

test("entrouEmCobrancaHumana: a partir de D+10 (default)", () => {
  assert.equal(entrouEmCobrancaHumana(9), false);
  assert.equal(entrouEmCobrancaHumana(10), true);
  assert.equal(entrouEmCobrancaHumana(30), true);
  assert.equal(DIAS_COBRANCA_HUMANA, 10);
  // limiar customizavel (futuro: config por instancia)
  assert.equal(entrouEmCobrancaHumana(5, 5), true);
  assert.equal(entrouEmCobrancaHumana(4, 5), false);
});

test("estadoPrazo: no_prazo / hoje / estourado", () => {
  assert.equal(estadoPrazo(1, 2), "no_prazo");
  assert.equal(estadoPrazo(2, 2), "hoje");
  assert.equal(estadoPrazo(3, 2), "estourado");
});

test("ordenarFila: excecoes no topo, depois estourado>hoje>no_prazo, depois idade desc", () => {
  const item = (categoria: ItemFila["categoria"], estado: ItemFila["estado"], idadeDias: number): ItemFila => ({
    categoria,
    titulo: `${categoria}-${estado}-${idadeDias}`,
    criadoEm: "2026-08-01T00:00:00Z",
    idadeDias,
    estado,
  });

  const entrada = [
    item("documento", "no_prazo", 1),
    item("parcela", "estourado", 5),
    item("excecao", "no_prazo", 0),
    item("documento", "estourado", 12),
    item("parcela", "hoje", 3),
  ];

  const ordenada = ordenarFila(entrada).map((i) => i.titulo);
  assert.deepEqual(ordenada, [
    "excecao-no_prazo-0", // excecao sempre primeiro
    "documento-estourado-12", // estourado, mais antigo
    "parcela-estourado-5", // estourado, menos antigo
    "parcela-hoje-3", // hoje
    "documento-no_prazo-1", // no prazo
  ]);

  // nao muta o array original
  assert.equal(entrada[0].titulo, "documento-no_prazo-1");
});

test("papelVeCategoria: gestor tudo; demais so a sua area", () => {
  // gestor ve tudo
  for (const c of ["documento", "parcela", "proposta", "fornecedor", "excecao", "sistema", "outro"] as const) {
    assert.equal(papelVeCategoria("gestor", c), true);
  }
  // financeiro: so parcela
  assert.equal(papelVeCategoria("financeiro", "parcela"), true);
  assert.equal(papelVeCategoria("financeiro", "documento"), false);
  // operacao: documentos e fornecedores, nao parcela
  assert.equal(papelVeCategoria("operacao", "documento"), true);
  assert.equal(papelVeCategoria("operacao", "fornecedor"), true);
  assert.equal(papelVeCategoria("operacao", "parcela"), false);
  // consultor: proposta e excecao (E1 visto negado, retencao em cancelamento)
  assert.equal(papelVeCategoria("consultor", "proposta"), true);
  assert.equal(papelVeCategoria("consultor", "excecao"), true);
  assert.equal(papelVeCategoria("consultor", "parcela"), false);
  assert.equal(papelVeCategoria("consultor", "documento"), false);
  // papel desconhecido nao ve nada (falha fechada)
  assert.equal(papelVeCategoria("root", "documento"), false);
});

test("filtrarPorPapel: financeiro so ve parcelas; nao muta a entrada", () => {
  const item = (categoria: ItemFila["categoria"]): ItemFila => ({
    categoria,
    titulo: categoria,
    criadoEm: "2026-08-01T00:00:00Z",
    idadeDias: 1,
    estado: "no_prazo",
  });
  const entrada = [item("documento"), item("parcela"), item("proposta")];
  const soFinanceiro = filtrarPorPapel(entrada, "financeiro").map((i) => i.categoria);
  assert.deepEqual(soFinanceiro, ["parcela"]);
  assert.equal(filtrarPorPapel(entrada, "gestor").length, 3);
  assert.equal(entrada.length, 3); // intacta
});

test("filtrarPorPapel: item com papelAlvo roteia pelo dono, nao pela categoria", () => {
  const exc = (papelAlvo: string, titulo: string): ItemFila => ({
    categoria: "excecao",
    titulo,
    criadoEm: "2026-08-01T00:00:00Z",
    idadeDias: 1,
    estado: "no_prazo",
    papelAlvo,
  });
  const entrada = [
    exc("consultor", "E1 visto negado"),
    exc("financeiro", "E9 chargeback"),
    exc("operacao", "E10 fraude"),
  ];
  // Cada papel ve so as exceptions das quais e dono...
  assert.deepEqual(filtrarPorPapel(entrada, "financeiro").map((i) => i.titulo), ["E9 chargeback"]);
  assert.deepEqual(filtrarPorPapel(entrada, "consultor").map((i) => i.titulo), ["E1 visto negado"]);
  assert.deepEqual(filtrarPorPapel(entrada, "operacao").map((i) => i.titulo), ["E10 fraude"]);
  // ...e o gestor ve todas.
  assert.equal(filtrarPorPapel(entrada, "gestor").length, 3);
});

test("podeVerItem: mesma regra da exibicao autoriza a acao (RBAC por acao)", () => {
  // Gestor opera tudo.
  assert.equal(podeVerItem("gestor", "parcela"), true);
  assert.equal(podeVerItem("gestor", "excecao", "consultor"), true);

  // Sem papelAlvo -> roteia por categoria: financeiro so parcela.
  assert.equal(podeVerItem("financeiro", "parcela"), true);
  assert.equal(podeVerItem("financeiro", "documento"), false);
  assert.equal(podeVerItem("operacao", "documento"), true);
  assert.equal(podeVerItem("operacao", "parcela"), false);
  assert.equal(podeVerItem("consultor", "proposta"), true);
  assert.equal(podeVerItem("consultor", "parcela"), false);

  // Com papelAlvo -> roteia pelo dono, ignorando a categoria: um E9
  // (excecao/financeiro) so pode ser operado por financeiro (ou gestor),
  // NUNCA por consultor/operacao, mesmo que 'excecao' caiba na categoria deles.
  assert.equal(podeVerItem("financeiro", "excecao", "financeiro"), true);
  assert.equal(podeVerItem("consultor", "excecao", "financeiro"), false);
  assert.equal(podeVerItem("operacao", "excecao", "financeiro"), false);
  assert.equal(podeVerItem("consultor", "excecao", "consultor"), true);

  // Papel desconhecido nao ve/opera nada.
  assert.equal(podeVerItem("intruso", "parcela"), false);
  assert.equal(podeVerItem("intruso", "excecao", "intruso"), true); // papelAlvo bate literalmente
});

test("filtrarMinhas / contarMinhas: por dono", () => {
  const base = (over: Partial<ItemFila>): ItemFila => ({
    categoria: "documento", titulo: "x", criadoEm: "2026-08-20T00:00:00Z", idadeDias: 1, estado: "no_prazo", ...over,
  });
  const itens: ItemFila[] = [
    base({ dono: "ana@x.com" }),
    base({ dono: "bruno@x.com" }),
    base({ dono: null }),
    base({ dono: "ana@x.com", estadoTask: "em_andamento" }),
  ];
  assert.equal(contarMinhas(itens, "ana@x.com"), 2);
  assert.equal(contarMinhas(itens, "ninguem@x.com"), 0);
  assert.equal(contarMinhas(itens, undefined), 0);
  assert.deepEqual(filtrarMinhas(itens, "ana@x.com").length, 2);
  // não muta a entrada
  assert.equal(itens.length, 4);
});
