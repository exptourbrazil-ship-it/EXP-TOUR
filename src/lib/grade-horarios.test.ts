// Testes do quadro de horários da proposta.
import { test } from "node:test";
import assert from "node:assert/strict";
import { montarQuadroHorarios } from "./grade-horarios.ts";

const bloco = (inicio: string | null, fim: string | null, descricao: string) => ({ inicio, fim, descricao });
const dias = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"];

test("dias iguais viram uma coluna 'Segunda a sexta'", () => {
  const manha = [bloco("09:00", "10:30", "Aulas"), bloco("10:30", "10:45", "Intervalo para café"), bloco("10:45", "12:15", "Aulas")];
  const q = montarQuadroHorarios(dias.map((dia) => ({ dia, blocos: manha })));
  assert.ok(q);
  assert.deepEqual(q.colunas, [{ rotulo: "Segunda a sexta" }]);
  assert.deepEqual(q.linhas.map((l) => l.horario), ["09:00–10:30", "10:30–10:45", "10:45–12:15"]);
  assert.deepEqual(q.linhas.map((l) => l.intervalo), [false, true, false]);
});

test("dias com agendas diferentes viram colunas separadas, com faixa vazia onde não há aula", () => {
  const q = montarQuadroHorarios([
    { dia: "Segunda", blocos: [bloco("09:00", "12:00", "Core"), bloco("13:00", "15:00", "Elective")] },
    { dia: "Terça", blocos: [bloco("09:00", "12:00", "Core")] },
    { dia: "Quarta", blocos: [bloco("09:00", "12:00", "Core")] },
  ]);
  assert.ok(q);
  assert.deepEqual(q.colunas.map((c) => c.rotulo), ["Segunda", "Terça a quarta"]);
  assert.deepEqual(q.linhas[1].celulas, ["Elective", null]);
});

test("dias não consecutivos listam os nomes", () => {
  const b = [bloco("09:00", "10:00", "Aula")];
  const q = montarQuadroHorarios([
    { dia: "Seg", blocos: b },
    { dia: "Qua", blocos: b },
    { dia: "Sex", blocos: b },
  ]);
  assert.ok(q);
  assert.equal(q.colunas[0].rotulo, "Segunda, quarta e sexta");
});

test("bloco sem horário (ex.: flexível) não monta quadro", () => {
  assert.equal(
    montarQuadroHorarios([{ dia: "Segunda", blocos: [bloco("09:00", "10:00", "Aula"), bloco(null, null, "Individual, horário flexível")] }]),
    null,
  );
});

test("grade vazia ou ausente não monta quadro", () => {
  assert.equal(montarQuadroHorarios([]), null);
  assert.equal(montarQuadroHorarios(null), null);
});

test("faixas ordenadas por horário mesmo com blocos fora de ordem", () => {
  const q = montarQuadroHorarios([
    { dia: "Segunda", blocos: [bloco("13:00", "14:15", "Fluência"), bloco("08:00", "08:45", "Individual")] },
  ]);
  assert.ok(q);
  assert.deepEqual(q.linhas.map((l) => l.horario), ["08:00–08:45", "13:00–14:15"]);
});
