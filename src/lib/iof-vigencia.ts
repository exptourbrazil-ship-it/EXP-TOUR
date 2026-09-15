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

// Alíquota vigente numa data: a de MAIOR `vigenteDesde` que já entrou em vigor
// (vigenteDesde <= data). null quando não há nenhuma vigência aplicável (o
// chamador cai no env/default — backward-compatible com a tabela vazia).
export function aliquotaIofVigente(vigencias: VigenciaIof[], dataISO: string): number | null {
  const d = (dataISO || "").slice(0, 10);
  if (!d) return null;
  let melhor: VigenciaIof | null = null;
  for (const v of vigencias) {
    const vd = (v?.vigenteDesde || "").slice(0, 10);
    if (!vd || vd > d) continue;
    // Alíquota tem de ser fração em [0,1]. Rejeita negativo/NaN E > 1 (defesa
    // contra erro percentual×fração — ex.: 3.5 no lugar de 0.035 — no dinheiro).
    if (!Number.isFinite(v.aliquota) || v.aliquota < 0 || v.aliquota > 1) continue;
    if (!melhor || vd > melhor.vigenteDesde.slice(0, 10)) melhor = v;
  }
  return melhor ? melhor.aliquota : null;
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
