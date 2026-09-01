// Merge PURO da config por tenant. Precedencia: linha do tenant (banco) -> env
// -> default de codigo. Toda origem pode faltar; a ultima (default) sempre existe.
// SEM imports: roda no runner nativo do Node. Os DEFAULTS e o ENV chegam ja
// resolvidos pelo servico (tenant-config.ts), para este modulo nao depender de
// "@/..." (e ser testavel isolado).

export type EtapaRetencaoCfg = { chave: string; rotulo: string; percentual: number };

export type ConfigTenant = {
  spreadCambio: number;
  iofCambio: number;
  moraMulta: number;
  moraJurosMes: number;
  moraIndice: number;
  reembolsoTeto: number;
  reembolsoEtapas: EtapaRetencaoCfg[];
};

// Linha bruta do banco (colunas nullable).
export type LinhaTenantConfig = {
  spread_cambio?: number | string | null;
  iof_cambio?: number | string | null;
  mora_multa?: number | string | null;
  mora_juros_mes?: number | string | null;
  mora_indice?: number | string | null;
  reembolso_teto?: number | string | null;
  reembolso_etapas?: unknown;
} | null;

// Valores de env ja parseados pelo servico (undefined quando ausente/invalido).
export type EnvTenantConfig = {
  spreadCambio?: number;
  iofCambio?: number;
  moraMulta?: number;
  moraJurosMes?: number;
  moraIndice?: number;
  reembolsoTeto?: number;
};

// Primeiro numero FINITO e >= 0 entre os candidatos (na ordem dada).
export function primeiroNumero(...cands: Array<number | string | null | undefined>): number | undefined {
  for (const c of cands) {
    if (c === null || c === undefined || c === "") continue;
    const n = Number(c);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return undefined;
}

// Chaves de etapa que a DERIVACAO produz (espelha ETAPA_CHAVES em
// etapa-anexo-i.ts). A config por tenant pode variar percentuais/rotulos, mas
// TEM de cobrir estas chaves — senao a etapa derivada nao acha correspondencia e
// a retencao cairia a 0% silenciosamente. Config que nao cobre -> ignorada (default).
export const CHAVES_ETAPA_OBRIGATORIAS = ["assinatura", "entrada", "loa", "visto_embarque"] as const;

// Normaliza etapas do jsonb (aceita so a forma {chave, rotulo, percentual}).
export function normalizarEtapas(v: unknown): EtapaRetencaoCfg[] | undefined {
  if (!Array.isArray(v) || v.length === 0) return undefined;
  const out: EtapaRetencaoCfg[] = [];
  for (const e of v) {
    if (!e || typeof e !== "object") return undefined;
    const chave = (e as any).chave;
    const rotulo = (e as any).rotulo;
    const percentual = Number((e as any).percentual);
    if (typeof chave !== "string" || !chave || typeof rotulo !== "string" || !Number.isFinite(percentual) || percentual < 0) {
      return undefined; // qualquer item invalido -> ignora a config e usa o default
    }
    out.push({ chave, rotulo, percentual });
  }
  // Cobertura das chaves obrigatorias: sem TODAS, a config e descartada (default),
  // evitando retencao 0% quando a etapa derivada nao existe na config.
  const chaves = new Set(out.map((e) => e.chave));
  if (!CHAVES_ETAPA_OBRIGATORIAS.every((k) => chaves.has(k))) return undefined;
  return out;
}

export function montarConfigTenant(row: LinhaTenantConfig, env: EnvTenantConfig, defaults: ConfigTenant): ConfigTenant {
  const r = row ?? {};
  const pick = (rowVal: number | string | null | undefined, envVal: number | undefined, def: number): number =>
    primeiroNumero(rowVal, envVal, def) ?? def;

  return {
    spreadCambio: pick(r.spread_cambio, env.spreadCambio, defaults.spreadCambio),
    iofCambio: pick(r.iof_cambio, env.iofCambio, defaults.iofCambio),
    moraMulta: pick(r.mora_multa, env.moraMulta, defaults.moraMulta),
    moraJurosMes: pick(r.mora_juros_mes, env.moraJurosMes, defaults.moraJurosMes),
    moraIndice: pick(r.mora_indice, env.moraIndice, defaults.moraIndice),
    reembolsoTeto: pick(r.reembolso_teto, env.reembolsoTeto, defaults.reembolsoTeto),
    reembolsoEtapas: normalizarEtapas(r.reembolso_etapas) ?? defaults.reembolsoEtapas,
  };
}
