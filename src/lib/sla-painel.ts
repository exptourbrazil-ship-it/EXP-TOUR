// Camada de dados do PAINEL DE SLA (server-only, service role). Consolida as
// exceções ABERTAS (não terminais) do tenant e avalia o prazo de cada uma em
// DIAS ÚTEIS (motor puro sla.ts), para o cockpit "SLAs com alertas" (doc 07 /
// docs 03). Escopado por tenant (membershipDoTenant) — um admin de um tenant
// nunca vê caso de outro. A autorização (capacidade) é feita na página.
import type { SupabaseClient } from "@supabase/supabase-js";
import { labelTipoExcecao, papelAlvoDoTipo, slaDiasDoTipo } from "@/lib/excecao";
import { resolverEscopoTenant, membershipDoTenant } from "@/lib/cron-tenant";
import { carregarFeriados } from "@/lib/dias-uteis-service";
import { avaliarSLA, rankUrgenciaSLA, type StatusSLA } from "@/lib/sla";

export type LinhaSLA = {
  id: string;
  tipo: string;
  tipoLabel: string;
  papelAlvo: string;
  titularId: string;
  titularNome: string | null;
  contratoId: string | null;
  abertaEmISO: string;
  prazoISO: string;
  diasUteisRestantes: number;
  atrasoDiasUteis: number;
  status: StatusSLA;
};

export type PainelSLA = {
  linhas: LinhaSLA[];
  contadores: { total: number; vencidos: number; venceHoje: number; noPrazo: number };
};

const VAZIO: PainelSLA = {
  linhas: [],
  contadores: { total: 0, vencidos: 0, venceHoje: 0, noPrazo: 0 },
};

// Monta o painel de SLA das exceções abertas do tenant. `agoraISO` injetável
// para teste/determinismo; default = agora.
export async function carregarPainelSLA(
  supabase: SupabaseClient,
  agoraISO: string = new Date().toISOString(),
): Promise<PainelSLA> {
  const escopo = await resolverEscopoTenant(supabase);
  const membership = await membershipDoTenant(supabase, escopo);
  // Tenant sem titulares -> nada a mostrar (evita `.in("titular_id", [])`).
  if (membership.titularIds.length === 0) return VAZIO;

  const { data: excecoes, error } = await supabase
    .from("case_exceptions")
    .select("id, tipo, status, aberta_em, titular_id, contrato_id, titular:titulares(nome_completo)")
    .in("status", ["aberta", "em_andamento"])
    .in("titular_id", membership.titularIds)
    .order("aberta_em", { ascending: true });
  if (error) throw new Error("Falha ao ler exceções do painel de SLA: " + error.message);

  // Feriados de negócio (São Paulo, doc 18.6). Hoje a tabela `feriado` guarda os
  // feriados dos PAÍSES de destino; os do Brasil ainda não estão semeados, então
  // o Set vem vazio e o motor degrada para "só fim de semana" — quando os
  // feriados nacionais forem semeados (pais='brasil'), o painel os usa sozinho.
  const feriados = await carregarFeriados(supabase, { pais: "brasil", tenantId: escopo.tenantId });

  const linhas: LinhaSLA[] = (excecoes ?? []).map((e: any) => {
    const abertaEmISO = (e.aberta_em as string) || agoraISO;
    const av = avaliarSLA(abertaEmISO, slaDiasDoTipo(e.tipo), agoraISO, feriados);
    const titularRel = e.titular;
    const titularNome = Array.isArray(titularRel)
      ? (titularRel[0]?.nome_completo ?? null)
      : (titularRel?.nome_completo ?? null);
    return {
      id: e.id as string,
      tipo: e.tipo as string,
      tipoLabel: labelTipoExcecao(e.tipo),
      papelAlvo: papelAlvoDoTipo(e.tipo),
      titularId: e.titular_id as string,
      titularNome,
      contratoId: (e.contrato_id as string) ?? null,
      abertaEmISO,
      prazoISO: av.prazoISO,
      diasUteisRestantes: av.diasUteisRestantes,
      atrasoDiasUteis: av.atrasoDiasUteis,
      status: av.status,
    };
  });

  // Ordena por urgência (vencidos e mais atrasados no topo).
  linhas.sort((a, b) => rankUrgenciaSLA(a) - rankUrgenciaSLA(b));

  const contadores = {
    total: linhas.length,
    vencidos: linhas.filter((l) => l.status === "vencido").length,
    venceHoje: linhas.filter((l) => l.status === "vence_hoje").length,
    noPrazo: linhas.filter((l) => l.status === "no_prazo").length,
  };

  return { linhas, contadores };
}
