// Resolver da config por tenant (server-only). Le a linha de tenant_config e a
// mescla com o env e os defaults de codigo (precedencia linha > env > default,
// ver tenant-config-merge). tenantId null (titular sem tenant = padrao EXP Tour)
// -> so env/defaults. Backward-compatible: tabela vazia = comportamento atual.
import type { SupabaseClient } from "@supabase/supabase-js";
import { montarConfigTenant, type ConfigTenant, type LinhaTenantConfig } from "@/lib/tenant-config-merge";
import { SPREAD_PADRAO, IOF_PADRAO } from "@/lib/cambio";
import { carregarIofVigente, carregarSpreadVigente } from "@/lib/iof-vigencia";
import { MORA_MULTA_PADRAO, MORA_JUROS_MES_PADRAO, MORA_INDICE_PADRAO } from "@/lib/mora";
import { TETO_RETENCAO_PADRAO, ETAPAS_ANEXO_I_PADRAO } from "@/lib/reembolso-anexo-i";

export type { ConfigTenant } from "@/lib/tenant-config-merge";

function envNum(nome: string): number | undefined {
  const v = Number(process.env[nome]);
  return Number.isFinite(v) && v >= 0 ? v : undefined;
}

function defaults(): ConfigTenant {
  return {
    spreadCambio: SPREAD_PADRAO,
    iofCambio: IOF_PADRAO,
    moraMulta: MORA_MULTA_PADRAO,
    moraJurosMes: MORA_JUROS_MES_PADRAO,
    moraIndice: MORA_INDICE_PADRAO,
    reembolsoTeto: TETO_RETENCAO_PADRAO,
    reembolsoEtapas: ETAPAS_ANEXO_I_PADRAO,
  };
}

export async function carregarConfigTenant(
  supabase: SupabaseClient,
  tenantId: string | null | undefined,
): Promise<ConfigTenant> {
  let row: LinhaTenantConfig = null;
  if (tenantId) {
    // Deploy-safe: em banco sem a tabela, o select retorna erro -> cai no env/default.
    const { data, error } = await supabase
      .from("tenant_config")
      .select("spread_cambio, iof_cambio, mora_multa, mora_juros_mes, mora_indice, reembolso_teto, reembolso_etapas")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!error && data) row = data as LinhaTenantConfig;
  }
  const env = {
    spreadCambio: envNum("SPREAD_CAMBIO_PERCENTUAL"),
    iofCambio: envNum("IOF_CAMBIO_PERCENTUAL"),
    moraMulta: envNum("MORA_MULTA_PERCENTUAL"),
    moraJurosMes: envNum("MORA_JUROS_MES_PERCENTUAL"),
    moraIndice: envNum("MORA_INDICE_PERCENTUAL"),
    reembolsoTeto: envNum("REEMBOLSO_TETO"),
  };
  const cfg = montarConfigTenant(row, env, defaults());

  // §8 (fonte única): a alíquota de IOF-câmbio vem da tabela de VIGÊNCIA (a
  // vigente hoje), que é autoritativa por ser federal (igual para todo tenant).
  // Tabela vazia/ausente -> mantém o resultado acima (env/default), backward-safe.
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const iofVigente = await carregarIofVigente(supabase, hoje);
  if (iofVigente != null) cfg.iofCambio = iofVigente;

  // O SPREAD segue a MESMA fonte, e nao e detalhe: `gerar-cobranca` RECOMPOE a
  // VET com `cfg.spreadCambio` antes de emitir o Pix. Se so a VET global
  // mudasse de spread, a tela mostraria 5% e a cobranca sairia a 6,6% —
  // divergencia entre o que o cliente ve e o que ele paga, no mesmo dia.
  // Precedencia EXPLICITA, diferente do IOF: o IOF e federal (igual para todo
  // tenant), o spread e remuneracao — uma instancia pode ter a sua. Entao a
  // vigencia e o PADRAO, e `tenant_config.spread_cambio` vence quando definido.
  // Sem isso a coluna do tenant viraria letra morta.
  if (row?.spread_cambio == null) {
    const spreadVigente = await carregarSpreadVigente(supabase, hoje);
    if (spreadVigente != null) cfg.spreadCambio = spreadVigente;
  }

  return cfg;
}

// Resolve o tenant de um titular (contratos nao tem tenant_id proprio; vem do
// titular). Null quando ausente -> config padrao.
export async function tenantDoTitular(supabase: SupabaseClient, titularId: string): Promise<string | null> {
  const { data } = await supabase.from("titulares").select("tenant_id").eq("id", titularId).maybeSingle();
  return (data?.tenant_id as string) ?? null;
}

// Indica se o tenant tem config de reembolso EXPLICITA (etapas OU teto nao-nulos
// em tenant_config). Serve de GATE juridico: sem config propria, a retencao do
// Anexo I usa os DEFAULTS de codigo ("a confirmar pelo juridico") — nesse caso o
// acerto deve permanecer provisorio (trava a execucao do refund). Deploy-safe:
// erro/tabela ausente -> false (mantem provisorio, o lado seguro).
export async function tenantTemConfigReembolso(
  supabase: SupabaseClient,
  tenantId: string | null | undefined,
): Promise<boolean> {
  if (!tenantId) return false;
  const { data, error } = await supabase
    .from("tenant_config")
    .select("reembolso_etapas, reembolso_teto")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error || !data) return false;
  return (data as { reembolso_etapas?: unknown; reembolso_teto?: unknown }).reembolso_etapas != null ||
    (data as { reembolso_teto?: unknown }).reembolso_teto != null;
}
