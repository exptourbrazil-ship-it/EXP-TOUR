import { test } from "node:test";
import assert from "node:assert/strict";
import { semanaISO, montarResumoSemanal, chaveResumo, conteudoResumo } from "./resumo-semanal.ts";

test("R1 semanaISO é estável e no formato AAAA-Www", () => {
  assert.match(semanaISO("2026-08-31"), /^2026-W\d{2}$/);
  // Mesma semana ISO para dias da mesma semana (seg 31/ago e qua 02/set 2026).
  assert.equal(semanaISO("2026-08-31"), semanaISO("2026-09-02"));
  // Semana seguinte muda a chave.
  assert.notEqual(semanaISO("2026-08-31"), semanaISO("2026-09-08"));
});

test("R2 montarResumoSemanal só tem atividade quando há algo", () => {
  assert.equal(montarResumoSemanal({ pendenciasAbertas: 0, novosEstudantes: 0, novosDocumentos: 0 }).temAtividade, false);
  assert.equal(montarResumoSemanal({ pendenciasAbertas: 2, novosEstudantes: 0, novosDocumentos: 0 }).temAtividade, true);
  assert.equal(montarResumoSemanal({ pendenciasAbertas: 0, novosEstudantes: 1, novosDocumentos: 0 }).temAtividade, true);
});

test("R3 contagem negativa/suja vira 0", () => {
  const r = montarResumoSemanal({ pendenciasAbertas: -3, novosEstudantes: 2.7, novosDocumentos: NaN as unknown as number });
  assert.equal(r.contagem.pendenciasAbertas, 0);
  assert.equal(r.contagem.novosEstudantes, 2);
  assert.equal(r.contagem.novosDocumentos, 0);
});

test("R4 chaveResumo é única por fornecedor+semana", () => {
  assert.equal(chaveResumo("sup1", "2026-W35"), "resumo_semanal:sup1:2026-W35");
  assert.notEqual(chaveResumo("sup1", "2026-W35"), chaveResumo("sup1", "2026-W36"));
});

test("R5 conteúdo PT lista as contagens", () => {
  const r = montarResumoSemanal({ pendenciasAbertas: 2, novosEstudantes: 1, novosDocumentos: 3 });
  const c = conteudoResumo(r, "pt");
  assert.equal(c.botaoLabel, "Abrir meu painel");
  assert.match(c.contexto, /2 pendências abertas/);
  assert.match(c.contexto, /1 novo estudante/);
  assert.match(c.contexto, /3 documentos novos/);
});

test("R6 conteúdo EN padrão", () => {
  const r = montarResumoSemanal({ pendenciasAbertas: 1, novosEstudantes: 0, novosDocumentos: 0 });
  const c = conteudoResumo(r, "en");
  assert.equal(c.botaoLabel, "Open my dashboard");
  assert.match(c.contexto, /1 open item/);
});
