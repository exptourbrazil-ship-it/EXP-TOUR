// Camada de dados do calendário de dias úteis (server-only, service role).
// Carrega os feriados por PAÍS (tabela `feriado`) num Set consumível pelo motor
// puro dias-uteis.ts. Feriados nacionais (tenant_id NULL) valem para todos; os do
// tenant se somam. Isola o SQL para o motor seguir puro/testável.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Feriados } from "@/lib/dias-uteis";

// Conjunto de feriados (YYYY-MM-DD) de um país, opcionalmente limitado a um
// intervalo e a um tenant (nacionais + do tenant). Falha -> Set vazio (o motor
// degrada para "só fim de semana", nunca quebra o cálculo de prazo).
export async function carregarFeriados(
  supabase: SupabaseClient,
  opts: { pais: string; deISO?: string; ateISO?: string; tenantId?: string | null },
): Promise<Feriados> {
  const set = new Set<string>();
  if (!opts.pais) return set;
  try {
    let q = supabase.from("feriado").select("data, tenant_id").eq("pais", opts.pais);
    if (opts.deISO) q = q.gte("data", opts.deISO.slice(0, 10));
    if (opts.ateISO) q = q.lte("data", opts.ateISO.slice(0, 10));
    const { data } = await q;
    for (const f of data ?? []) {
      // Nacional (tenant_id null) sempre entra; específico entra só do tenant pedido.
      if (f.tenant_id == null || (opts.tenantId && f.tenant_id === opts.tenantId)) {
        if (typeof f.data === "string") set.add(f.data.slice(0, 10));
      }
    }
  } catch {
    // Deploy-safe: tabela ausente / erro transitório -> sem feriados (só fds).
  }
  return set;
}
