// Fonte única da alíquota de IOF-câmbio por VIGÊNCIA (Contrato v3.1 §8:
// "Alíquota de IOF — tabela com vigência por data — NUNCA constante em código ou
// em texto"). A alíquota aplicada é a VIGENTE NA DATA da operação. O histórico já
// é preservado por parcela (cotacoes_cambio grava spread+iof do dia); esta tabela
// é a fonte para NOVAS composições e permite AGENDAR uma mudança de alíquota.
//
// A seleção (maior vigente_desde <= data) é PURA e testável; o service só busca as
// linhas. `import type` é apagado pelo type-stripping, então o runner do Node roda
// o arquivo sem resolver o SDK.
import type { SupabaseClient } from "@supabase/supabase-js";

export type VigenciaIof = { aliquota: number; vigenteDesde: string };
/** Vigência genérica de um percentual (IOF, spread): fração em [0,1] + data. */
export type VigenciaPercentual = { percentual: number; vigenteDesde: string };

/**
 * Percentual vigente numa data: o de MAIOR `vigenteDesde` que já entrou em vigor
 * (vigenteDesde <= data). null quando não há nenhuma vigência aplicável (o
 * chamador cai no env/default — backward-compatible com a tabela vazia).
 *
 * Serve IOF e spread: os dois compõem a mesma VET e a mesma validação de
 * dinheiro vale para os dois.
 */
export function percentualVigente(vigencias: VigenciaPercentual[], dataISO: string): number | null {
  const d = (dataISO || "").slice(0, 10);
  if (!d) return null;
  let melhor: VigenciaPercentual | null = null;
  for (const v of vigencias) {
    const vd = (v?.vigenteDesde || "").slice(0, 10);
    if (!vd || vd > d) continue;
    // Percentual tem de ser fração em [0,1]. Rejeita negativo/NaN E > 1 (defesa
    // contra erro percentual×fração — ex.: 3.5 no lugar de 0.035 — no dinheiro).
    if (!Number.isFinite(v.percentual) || v.percentual < 0 || v.percentual > 1) continue;
    if (!melhor || vd > melhor.vigenteDesde.slice(0, 10)) melhor = v;
  }
  return melhor ? melhor.percentual : null;
}

export function aliquotaIofVigente(vigencias: VigenciaIof[], dataISO: string): number | null {
  return percentualVigente(
    vigencias.map((v) => ({ percentual: v?.aliquota, vigenteDesde: v?.vigenteDesde })),
    dataISO,
  );
}

// Busca a alíquota vigente na data (server-only). Deploy-safe: tabela ausente/erro
// -> null (mantém o env/default). A tabela é pequena (uma linha por mudança de
// alíquota), então carregamos todas e aplicamos a seleção pura.
export async function carregarIofVigente(
  supabase: SupabaseClient,
  dataISO: string,
): Promise<number | null> {
  const { data, error } = await supabase.from("iof_vigencia").select("aliquota, vigente_desde");
  if (error || !data) return null;
  const vigencias: VigenciaIof[] = data.map((r) => ({
    aliquota: Number((r as { aliquota: unknown }).aliquota),
    vigenteDesde: (r as { vigente_desde?: string }).vigente_desde ?? "",
  }));
  return aliquotaIofVigente(vigencias, dataISO);
}

/**
 * Spread de intermediação vigente na data (server-only). Mesmo desenho do IOF e
 * pelo mesmo motivo: o spread compõe a VET que o cliente paga, então não pode
 * viver só numa variável de ambiente — foi assim que 6,6% ficou em produção
 * enquanto a proposta dizia 5%. Tabela ausente/erro -> null (mantém env/default).
 */
export async function carregarSpreadVigente(
  supabase: SupabaseClient,
  dataISO: string,
): Promise<number | null> {
  const { data, error } = await supabase.from("spread_cambio_vigencia").select("percentual, vigente_desde");
  if (error || !data) {
    // Falhar aqui devolve o env/default, que pode ser o percentual ERRADO. Sem
    // log, a reversao seria silenciosa — foi exatamente assim que 6,6% durou.
    if (error) console.error("[spread-vigencia] falha ao ler a tabela:", error.message);
    return null;
  }
  return percentualVigente(
    data.map((r) => ({
      percentual: Number((r as { percentual: unknown }).percentual),
      vigenteDesde: (r as { vigente_desde?: string }).vigente_desde ?? "",
    })),
    dataISO,
  );
}
