import { test } from "node:test";
import assert from "node:assert/strict";
import { aliquotaIofVigente, type VigenciaIof } from "./iof-vigencia.ts";

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
