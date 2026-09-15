import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolverDegrauRemuneracao,
  calcularRemuneracaoServicos,
  PCT_POR_ESTADO,
  TETO_REMUNERACAO,
} from "./remuneracao-servicos.ts";

// ── degrau por estado ────────────────────────────────────────────────────────

test("degrau segue o percentual do estado quando a data não força", () => {
  assert.equal(resolverDegrauRemuneracao({ estado: "nao_submetida", diasAteInicio: 200 }).percentual, 0);
  assert.equal(resolverDegrauRemuneracao({ estado: "submetida", diasAteInicio: 200 }).percentual, 0.02);
  assert.equal(resolverDegrauRemuneracao({ estado: "loa", diasAteInicio: 200 }).percentual, 0.035);
  assert.equal(resolverDegrauRemuneracao({ estado: "visto", diasAteInicio: 200 }).percentual, 0.05);
});

test("nao_submetida com atraso imputável ao contratante vira 2%", () => {
  assert.equal(resolverDegrauRemuneracao({ estado: "nao_submetida", diasAteInicio: 200, atrasoImputavel: true }).percentual, 0.02);
});

test("menos de 30 dias do início força 5%, e a memória diz que foi a data", () => {
  const d = resolverDegrauRemuneracao({ estado: "submetida", diasAteInicio: 10 });
  assert.equal(d.percentual, 0.05);
  assert.equal(d.origem, "data");
  assert.equal(d.forcadoPorData, true);
});

test("degrau é o MAIOR entre estado e data (visto > 5% da data => origem estado)", () => {
  const d = resolverDegrauRemuneracao({ estado: "visto", diasAteInicio: 5 });
  assert.equal(d.percentual, 0.05);
  assert.equal(d.origem, "estado"); // empate no 5% => estado
});

test("exatamente 30 dias NÃO força (< estrito)", () => {
  assert.equal(resolverDegrauRemuneracao({ estado: "submetida", diasAteInicio: 30 }).percentual, 0.02);
  assert.equal(resolverDegrauRemuneracao({ estado: "submetida", diasAteInicio: 29 }).percentual, 0.05);
});

test("data desconhecida (null) não força", () => {
  assert.equal(resolverDegrauRemuneracao({ estado: "nao_submetida", diasAteInicio: null }).percentual, 0);
});

test("estado inválido cai em nao_submetida (0%)", () => {
  assert.equal(resolverDegrauRemuneracao({ estado: "xpto", diasAteInicio: 200 }).percentual, 0);
});

// ── cálculo sobre Componente Educacional + teto 800 ──────────────────────────

test("Remuneração incide sobre o Componente Educacional (não sobre passagem/seguro)", () => {
  // Componente Educacional 12000 (o Custo do Programa seria 16500 com terceiros).
  const r = calcularRemuneracaoServicos({ moeda: "CAD", componenteEducacional: 12000, estado: "submetida", diasAteInicio: 200 });
  assert.equal(r.valor, 240); // 2% de 12000, abaixo do teto
  assert.equal(r.base, 12000);
});

test("teto de 800 na moeda de referência limita a Remuneração", () => {
  assert.equal(TETO_REMUNERACAO, 800);
  const r = calcularRemuneracaoServicos({ componenteEducacional: 40000, estado: "visto", diasAteInicio: 200 });
  assert.equal(r.bruto, 2000); // 5% de 40000
  assert.equal(r.tetoAtingido, true);
  assert.equal(r.valor, 800);
  assert.ok(r.memoria.some((l) => l.rotulo.includes("teto")));
});

test("nao_submetida sem atraso => Remuneração zero", () => {
  const r = calcularRemuneracaoServicos({ componenteEducacional: 12000, estado: "nao_submetida", diasAteInicio: 200 });
  assert.equal(r.valor, 0);
  assert.equal(PCT_POR_ESTADO.nao_submetida, 0);
});

test("<30 dias força 5% também no cálculo, com base no Componente Educacional", () => {
  const r = calcularRemuneracaoServicos({ componenteEducacional: 10000, estado: "nao_submetida", diasAteInicio: 20 });
  assert.equal(r.degrau.percentual, 0.05);
  assert.equal(r.valor, 500);
});
