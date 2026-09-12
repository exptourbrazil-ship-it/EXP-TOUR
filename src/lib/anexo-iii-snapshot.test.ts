import { test } from "node:test";
import assert from "node:assert/strict";
import {
  montarAnexoIIISnapshot,
  serializarAnexoIIISnapshot,
  ANEXO_III_SCHEMA_VERSAO,
  type AnexoIIIItemEntrada,
} from "./anexo-iii-snapshot.ts";

function item(over: Partial<AnexoIIIItemEntrada> = {}): AnexoIIIItemEntrada {
  return {
    fornecedor: "LSI London",
    natureza: "curso",
    valor: 1000,
    moeda: "gbp",
    prazo: "21 dias",
    evento: null,
    documento_viabiliza: null,
    consequencia_atraso: null,
    politica_cancelamento: "2 semanas",
    fonte: "site",
    ordem: 0,
    ...over,
  };
}

test("normaliza: trim/null, valor 2 casas, moeda maiúscula", () => {
  const s = montarAnexoIIISnapshot([item({ natureza: "  ", valor: 99.999, moeda: "gbp" })], { emitidoEm: "2026-09-12T10:00:00Z" });
  assert.equal(s.schema_versao, ANEXO_III_SCHEMA_VERSAO);
  assert.equal(s.itens[0].natureza, null);
  assert.equal(s.itens[0].valor, 100);
  assert.equal(s.itens[0].moeda, "GBP");
  assert.equal(s.itens[0].fornecedor, "LSI London");
  assert.equal(s.emitido_em, "2026-09-12T10:00:00Z");
});

test("ordenação determinística: hash independe da ordem das linhas", () => {
  const a = montarAnexoIIISnapshot(
    [item({ fornecedor: "B", ordem: 1 }), item({ fornecedor: "A", ordem: 0 })],
    { emitidoEm: "2026-09-12T10:00:00Z" },
  );
  const b = montarAnexoIIISnapshot(
    [item({ fornecedor: "A", ordem: 0 }), item({ fornecedor: "B", ordem: 1 })],
    { emitidoEm: "2026-09-12T10:00:00Z" },
  );
  assert.equal(serializarAnexoIIISnapshot(a), serializarAnexoIIISnapshot(b));
  assert.equal(a.itens[0].fornecedor, "A"); // ordenado por ordem
});

test("serialização canônica é estável entre ordens de chave", () => {
  const s = montarAnexoIIISnapshot([item()], { emitidoEm: "2026-09-12T10:00:00Z" });
  const outraOrdem = { itens: s.itens, emitido_em: s.emitido_em, politicas_referenciadas: s.politicas_referenciadas, schema_versao: s.schema_versao };
  assert.equal(serializarAnexoIIISnapshot(s), serializarAnexoIIISnapshot(outraOrdem));
});

test("lista vazia produz snapshot vazio válido", () => {
  const s = montarAnexoIIISnapshot([], { emitidoEm: "2026-09-12T10:00:00Z" });
  assert.deepEqual(s.itens, []);
  assert.deepEqual(s.politicas_referenciadas, []);
});
