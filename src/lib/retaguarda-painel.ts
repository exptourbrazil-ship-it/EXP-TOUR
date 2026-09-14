// Camada de dados do PAINEL DE RETAGUARDA (server-only, service role). Lista os
// achados ABERTOS do tenant para o painel de saúde (doc 07 §3.8). Escopado por
// tenant (retaguarda_achado.tenant_id = tenant do deploy); a autorização por
// capacidade fica na página. Só leitura — a varredura/persistência é do cron.
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolverEscopoTenant } from "@/lib/cron-tenant";
import type { SeveridadeAchado } from "@/lib/retaguarda";

export type LinhaAchado = {
  id: string;
  categoria: string;
  severidade: SeveridadeAchado;
  entidadeTipo: string;
  entidadeId: string;
  contratoId: string | null;
  titularId: string | null;
  resumo: string;
  primeiraVezISO: string;
  ultimaVezISO: string;
};

export type PainelRetaguarda = {
  linhas: LinhaAchado[];
  contadores: { total: number; alto: number; medio: number; baixo: number };
};

const PESO: Record<SeveridadeAchado, number> = { alto: 0, medio: 1, baixo: 2 };

export async function carregarPainelRetaguarda(
  supabase: SupabaseClient,
): Promise<PainelRetaguarda> {
  const escopo = await resolverEscopoTenant(supabase);

  const { data, error } = await supabase
    .from("retaguarda_achado")
    .select(
      "id, categoria, severidade, entidade_tipo, entidade_id, contrato_id, resumo, primeira_vez, ultima_vez, contrato:contratos(titular_id)",
    )
    .eq("tenant_id", escopo.tenantId)
    .eq("status", "aberto");
  if (error) throw new Error("Falha ao ler achados de retaguarda: " + error.message);

  const linhas: LinhaAchado[] = (data ?? []).map((r: any) => {
    const rel = r.contrato;
    const titularId = Array.isArray(rel) ? (rel[0]?.titular_id ?? null) : (rel?.titular_id ?? null);
    return {
      id: r.id as string,
      categoria: r.categoria as string,
      severidade: r.severidade as SeveridadeAchado,
      entidadeTipo: r.entidade_tipo as string,
      entidadeId: r.entidade_id as string,
      contratoId: (r.contrato_id as string) ?? null,
      titularId,
      resumo: r.resumo as string,
      primeiraVezISO: r.primeira_vez as string,
      ultimaVezISO: r.ultima_vez as string,
    };
  });

  // Mais grave primeiro; empate pela deteccao mais recente.
  linhas.sort(
    (a, b) => PESO[a.severidade] - PESO[b.severidade] || b.ultimaVezISO.localeCompare(a.ultimaVezISO),
  );

  const contadores = {
    total: linhas.length,
    alto: linhas.filter((l) => l.severidade === "alto").length,
    medio: linhas.filter((l) => l.severidade === "medio").length,
    baixo: linhas.filter((l) => l.severidade === "baixo").length,
  };

  return { linhas, contadores };
}
