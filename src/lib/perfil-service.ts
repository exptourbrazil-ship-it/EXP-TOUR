// Loader do PERFIL de acesso do titular (server-only). O enforcement lê o perfil
// SEMPRE do banco no momento da requisição — nunca de um campo carimbado na
// sessão — porque a sessão dura 30 dias e o perfil é um controle de segurança
// (bloqueio financeiro, LGPD): promover alguém a Participante tem de valer na
// hora, não só no próximo login. NULL/ausente => contratante (normalização).
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizarPerfil, podeCliente, type CapacidadeCliente, type PerfilTitular } from "@/lib/perfil-acesso";

// Perfil vigente de um titular. Falha para o lado seguro do comportamento atual:
// sem linha ou erro de leitura => contratante (não bloqueia por transiente), o
// mesmo default da coluna NULL. O bloqueio só existe para quem está marcado.
export async function carregarPerfilTitular(
  supabase: SupabaseClient,
  titularId: string,
): Promise<PerfilTitular> {
  const { data } = await supabase
    .from("titulares")
    .select("perfil")
    .eq("id", titularId)
    .maybeSingle();
  return normalizarPerfil((data as { perfil?: string | null } | null)?.perfil ?? null);
}

// Guarda de enforcement: o titular DESTA sessão tem a capacidade `cap`? Lê o
// perfil vigente do banco e aplica a matriz pura. Usado por rotas/páginas para
// gatear as superfícies financeiras (Participante nunca vê/gera dinheiro).
export async function titularPodeCliente(
  supabase: SupabaseClient,
  titularId: string,
  cap: CapacidadeCliente,
): Promise<boolean> {
  const perfil = await carregarPerfilTitular(supabase, titularId);
  return podeCliente(perfil, cap);
}
