// Testes dos helpers puros da Fila do Dia. Roda com `npm test` (node --test).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  idadeEmDias,
  diasDeAtraso,
  entrouEmCobrancaHumana,
  estadoPrazo,
  ordenarFila,
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
