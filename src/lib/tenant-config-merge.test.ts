import { test } from "node:test";
import assert from "node:assert/strict";
import {
  montarConfigTenant,
  primeiroNumero,
  normalizarEtapas,
  CHAVES_ETAPA_OBRIGATORIAS,
  type ConfigTenant,
} from "./tenant-config-merge.ts";

// Conjunto minimo de etapas que cobre as 4 chaves derivadas (Anexo I). Serve de
// base valida para os testes que precisam de uma config de etapas aceita.
const ETAPAS_COBERTAS = CHAVES_ETAPA_OBRIGATORIAS.map((chave, i) => ({
  chave,
  rotulo: chave.toUpperCase(),
  percentual: (i + 1) * 0.01,
}));

const DEFAULTS: ConfigTenant = {
  spreadCambio: 0.05,
  iofCambio: 0.035,
  moraMulta: 0.02,
  moraJurosMes: 0.01,
  moraIndice: 0,
  reembolsoTeto: 800,
  reembolsoEtapas: [{ chave: "assinatura", rotulo: "Após a assinatura", percentual: 0.01 }],
};

// C1 — tabela vazia + sem env -> defaults (backward-compatible).
test("C1 defaults quando vazio", () => {
  const c = montarConfigTenant(null, {}, DEFAULTS);
  assert.deepEqual(c, DEFAULTS);
});

// C2 — env sobrepoe o default; linha sobrepoe o env.
test("C2 precedencia linha > env > default", () => {
  const c = montarConfigTenant(
    { mora_multa: 0.03 },
    { moraMulta: 0.04, moraJurosMes: 0.015 },
    DEFAULTS,
  );
  assert.equal(c.moraMulta, 0.03); // linha vence
  assert.equal(c.moraJurosMes, 0.015); // env (sem linha)
  assert.equal(c.moraIndice, 0); // default
});

// C3 — valores invalidos/negativos na linha caem para env/default.
test("C3 invalidos ignorados", () => {
  const c = montarConfigTenant({ mora_multa: -1, reembolso_teto: "abc" }, {}, DEFAULTS);
  assert.equal(c.moraMulta, 0.02);
  assert.equal(c.reembolsoTeto, 800);
});

// C4 — numero em string (jsonb/numeric do PG chega as vezes como string).
test("C4 string numerica", () => {
  const c = montarConfigTenant({ mora_multa: "0.025", reembolso_teto: "1000" }, {}, DEFAULTS);
  assert.equal(c.moraMulta, 0.025);
  assert.equal(c.reembolsoTeto, 1000);
});

// C5 — etapas validas (cobrindo as 4 chaves) sobrepoem; invalidas caem no default.
test("C5 etapas", () => {
  const c = montarConfigTenant({ reembolso_etapas: ETAPAS_COBERTAS }, {}, DEFAULTS);
  assert.deepEqual(c.reembolsoEtapas, ETAPAS_COBERTAS);

  const cInvalida = montarConfigTenant({ reembolso_etapas: [{ chave: "x" }] }, {}, DEFAULTS);
  assert.deepEqual(cInvalida.reembolsoEtapas, DEFAULTS.reembolsoEtapas); // item invalido -> default

  assert.equal(normalizarEtapas([]), undefined);
  assert.equal(normalizarEtapas("nao-array"), undefined);
});

// C7 — etapas bem formadas mas que NAO cobrem as 4 chaves derivadas sao
// descartadas (caem no default), evitando retencao 0% quando a etapa derivada
// (ex.: "entrada") nao existe na config do tenant.
test("C7 etapas sem cobrir as chaves obrigatorias -> default", () => {
  // Retira uma chave obrigatoria (entrada) -> cobertura incompleta.
  const semEntrada = ETAPAS_COBERTAS.filter((e) => e.chave !== "entrada");
  assert.equal(normalizarEtapas(semEntrada), undefined);
  const c = montarConfigTenant({ reembolso_etapas: semEntrada }, {}, DEFAULTS);
  assert.deepEqual(c.reembolsoEtapas, DEFAULTS.reembolsoEtapas);

  // Cobrir TODAS + extras e aceito (superset das obrigatorias).
  const comExtra = [...ETAPAS_COBERTAS, { chave: "extra", rotulo: "Extra", percentual: 0.5 }];
  assert.deepEqual(normalizarEtapas(comExtra), comExtra);
});

// C6 — primeiroNumero.
test("C6 primeiroNumero", () => {
  assert.equal(primeiroNumero(null, undefined, "", 0.05), 0.05);
  assert.equal(primeiroNumero(0.03, 0.04), 0.03);
  assert.equal(primeiroNumero(-1, 0.04), 0.04); // negativo pulado
  assert.equal(primeiroNumero(0), 0); // zero e valido (>=0)
  assert.equal(primeiroNumero(null, undefined), undefined);
});
