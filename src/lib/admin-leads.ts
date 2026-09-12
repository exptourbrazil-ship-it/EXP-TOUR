// NB: modulo server-only (service role do Supabase). So deve ser importado por
// server components e rotas de API — nunca por codigo client.
//
// Carrega os LEADS do funil (orcamento lead-facing) para o admin. O lead traz o
// programa escolhido e o snapshot do orcamento em `params`; aqui nao ha calculo
// de dinheiro — so leitura para a fila e o Caso 360 do lead.
import { createClient } from "@supabase/supabase-js";
import { tenantIdAtual } from "@/lib/catalog-service";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );
}

export type LeadLista = {
  id: string;
  nome: string;
  cpf: string | null;
  email: string | null;
  telefone: string | null;
  participanteNome: string | null;
  programaNome: string | null;
  escola: string | null;
  origem: string;
  status: string;
  // true quando o CPF do lead ja casa com um titular existente (conta na Area
  // do Cliente) — sinal para o consultor de que e um cliente que voltou.
  temTitular: boolean;
  createdAt: string;
};

export type LeadDetalhe = LeadLista & {
  titularId: string | null;
  programaId: string | null;
  quoteId: string | null;
  params: Record<string, unknown> | null;
  updatedAt: string | null;
};

// Lista os leads (mais recentes primeiro). Lanca em falha de query.
export async function carregarLeads(): Promise<LeadLista[]> {
  const supabase = getSupabase();
  const tenantId = await tenantIdAtual(supabase); // escopo do tenant (defesa em profundidade)
  const { data, error } = await supabase
    .from("lead")
    .select("id, nome, cpf, email, telefone, participante_nome, programa_nome, escola, origem, status, titular_id, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error("Falha ao carregar leads.");
  return (data || []).map((l) => ({
    id: l.id as string,
    nome: (l.nome as string) ?? "",
    cpf: (l.cpf as string) ?? null,
    email: (l.email as string) ?? null,
    telefone: (l.telefone as string) ?? null,
    participanteNome: (l.participante_nome as string) ?? null,
    programaNome: (l.programa_nome as string) ?? null,
    escola: (l.escola as string) ?? null,
    origem: (l.origem as string) ?? "orcamento",
    status: (l.status as string) ?? "novo",
    temTitular: !!l.titular_id,
    createdAt: l.created_at as string,
  }));
}

// Carrega um lead completo (com params do orcamento) para o Caso 360. Retorna
// null se nao existir.
export async function carregarLead(id: string): Promise<LeadDetalhe | null> {
  const supabase = getSupabase();
  const tenantId = await tenantIdAtual(supabase); // escopo do tenant (evita leitura cross-tenant por id)
  const { data, error } = await supabase
    .from("lead")
    .select("id, nome, cpf, email, telefone, participante_nome, programa_id, programa_nome, escola, origem, status, titular_id, quote_id, params, created_at, updated_at")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new Error("Falha ao carregar o lead.");
  if (!data) return null;
  return {
    id: data.id as string,
    nome: (data.nome as string) ?? "",
    cpf: (data.cpf as string) ?? null,
    email: (data.email as string) ?? null,
    telefone: (data.telefone as string) ?? null,
    participanteNome: (data.participante_nome as string) ?? null,
    programaId: (data.programa_id as string) ?? null,
    programaNome: (data.programa_nome as string) ?? null,
    escola: (data.escola as string) ?? null,
    origem: (data.origem as string) ?? "orcamento",
    status: (data.status as string) ?? "novo",
    titularId: (data.titular_id as string) ?? null,
    quoteId: (data.quote_id as string) ?? null,
    temTitular: !!data.titular_id,
    params: (data.params as Record<string, unknown>) ?? null,
    createdAt: data.created_at as string,
    updatedAt: (data.updated_at as string) ?? null,
  };
}
