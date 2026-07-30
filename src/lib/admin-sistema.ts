// NB: modulo server-only (usa a service role do Supabase). So deve ser
// importado por server components e rotas de API — nunca por codigo client.
import { createClient } from "@supabase/supabase-js";
import { calcularNps } from "@/lib/nps";
import type { ResumoNps } from "@/lib/nps";

// Janelas da regua de cobranca (ver lembretes_cobranca / cron regua-cobranca).
export const JANELAS_REGUA = ["D-3", "D0", "D+1", "D+5"] as const;

export type ResumoSistema = {
  eventos: {
    pendente: number;
    processado: number;
    ignorado: number;
    erro: number;
  };
  regua: {
    total: number;
    ultimos7dias: number;
    porJanela: Record<string, number>;
  };
  nps: ResumoNps;
};

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  return createClient(supabaseUrl, serviceRoleKey);
}

// Head count (nao traz linhas) de uma tabela com filtros de igualdade e um
// filtro opcional de "created/enviado desde". Retorna 0 em caso de erro.
async function contar(
  supabase: ReturnType<typeof getSupabase>,
  tabela: string,
  filtros: Record<string, string>,
  desde?: { coluna: string; valor: string }
): Promise<number> {
  let q = supabase.from(tabela).select("id", { count: "exact", head: true });
  for (const [coluna, valor] of Object.entries(filtros)) {
    q = q.eq(coluna, valor);
  }
  if (desde) {
    q = q.gte(desde.coluna, desde.valor);
  }
  const { count, error } = await q;
  if (error) return 0;
  return count ?? 0;
}

// Carrega o resumo de saude do sistema: eventos por status, atividade da regua
// de cobranca e NPS. Tolerante a falhas parciais (cada bloco cai para 0/vazio).
export async function carregarSistema(): Promise<ResumoSistema> {
  const supabase = getSupabase();
  const seteDiasAtras = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [pendente, processado, ignorado, erro] = await Promise.all([
    contar(supabase, "events", { status: "pendente" }),
    contar(supabase, "events", { status: "processado" }),
    contar(supabase, "events", { status: "ignorado" }),
    contar(supabase, "events", { status: "erro" }),
  ]);

  const [total, ultimos7dias, ...porJanelaArr] = await Promise.all([
    contar(supabase, "lembretes_cobranca", {}),
    contar(supabase, "lembretes_cobranca", {}, { coluna: "enviado_at", valor: seteDiasAtras }),
    ...JANELAS_REGUA.map((janela) => contar(supabase, "lembretes_cobranca", { janela })),
  ]);
  const porJanela: Record<string, number> = {};
  JANELAS_REGUA.forEach((janela, i) => {
    porJanela[janela] = porJanelaArr[i];
  });

  // NPS: busca as notas e agrega com o helper puro.
  let nps: ResumoNps = { total: 0, promotores: 0, neutros: 0, detratores: 0, score: 0 };
  const { data: respostas } = await supabase.from("nps_respostas").select("nota");
  if (respostas) {
    nps = calcularNps(respostas.map((r: any) => r.nota));
  }

  return {
    eventos: { pendente, processado, ignorado, erro },
    regua: { total, ultimos7dias, porJanela },
    nps,
  };
}
