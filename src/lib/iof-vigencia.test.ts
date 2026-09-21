import { test } from "node:test";
import assert from "node:assert/strict";
import { aliquotaIofVigente, percentualVigente, type VigenciaIof } from "./iof-vigencia.ts";

const VIG: VigenciaIof[] = [
  { aliquota: 0.038, vigenteDesde: "2020-01-01" },
  { aliquota: 0.035, vigenteDesde: "2022-01-01" },
  { aliquota: 0.033, vigenteDesde: "2025-06-01" }, // mudança agendada
];

test("escolhe a alíquota vigente na data (maior vigente_desde <= data)", () => {
  assert.equal(aliquotaIofVigente(VIG, "2021-05-10"), 0.038);
  assert.equal(aliquotaIofVigente(VIG, "2022-01-01"), 0.035); // limite inclusivo
  assert.equal(aliquotaIofVigente(VIG, "2024-12-31"), 0.035);
  assert.equal(aliquotaIofVigente(VIG, "2025-06-01"), 0.033);
  assert.equal(aliquotaIofVigente(VIG, "2026-09-15"), 0.033);
});

test("antes de qualquer vigência => null (cai no env/default)", () => {
  assert.equal(aliquotaIofVigente(VIG, "2019-12-31"), null);
});

test("tabela vazia => null", () => {
  assert.equal(aliquotaIofVigente([], "2026-09-15"), null);
});

test("ignora linhas inválidas (negativa/NaN/>1, vigenteDesde vazio)", () => {
  const sujo: VigenciaIof[] = [
    { aliquota: -1, vigenteDesde: "2020-01-01" },
    { aliquota: Number.NaN, vigenteDesde: "2021-01-01" },
    { aliquota: 3.5, vigenteDesde: "2024-06-01" }, // erro percentual×fração => rejeitado
    { aliquota: 0.035, vigenteDesde: "" },
    { aliquota: 0.03, vigenteDesde: "2023-01-01" },
  ];
  // Apesar da linha 3.5 (2024) ser a mais recente, é rejeitada => vale a de 2023.
  assert.equal(aliquotaIofVigente(sujo, "2026-01-01"), 0.03);
});

test("data inválida/vazia => null", () => {
  assert.equal(aliquotaIofVigente(VIG, ""), null);
});

// ── spread (mesma selecao pura, outro percentual) ────────────────────────────
test("percentualVigente serve spread e IOF com a mesma regra", () => {
  const v = [
    { percentual: 0.066, vigenteDesde: "2024-01-01" },
    { percentual: 0.05, vigenteDesde: "2026-09-21" },
  ];
  assert.equal(percentualVigente(v, "2026-09-20"), 0.066, "antes da vigencia, o spread antigo");
  assert.equal(percentualVigente(v, "2026-09-21"), 0.05, "limite inclusivo");
  assert.equal(percentualVigente(v, "2027-03-01"), 0.05);
  assert.equal(percentualVigente(v, "2023-12-31"), null, "sem vigencia aplicavel -> env/default");
});

test("percentualVigente recusa percentual fora de [0,1] (erro de fracao x percentual)", () => {
  // 5 no lugar de 0.05 multiplicaria a conta do cliente por 6.
  assert.equal(percentualVigente([{ percentual: 5, vigenteDesde: "2026-01-01" }], "2026-06-01"), null);
  assert.equal(percentualVigente([{ percentual: -0.05, vigenteDesde: "2026-01-01" }], "2026-06-01"), null);
  assert.equal(percentualVigente([{ percentual: Number.NaN, vigenteDesde: "2026-01-01" }], "2026-06-01"), null);
});
