// Servico do pedido de confirmacao de disponibilidade (doc 06, alerta 5).
// SERVER-ONLY (service role). Posse sempre pelo supplierId (a escola da sessao
// no portal; o fornecedor do contrato no admin). Uma escola so ve/responde os
// proprios pedidos.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SolicitacaoDados, RespostaDados, ConfirmKind, ConfirmStatus } from "@/lib/confirmacao-disponibilidade";

export type Confirmacao = {
  id: string;
  supplierId: string;
  contratoId: string | null;
  estudanteNome: string | null;
  kind: ConfirmKind;
  message: string | null;
  status: ConfirmStatus;
  responseNote: string | null;
  requestedBy: string | null;
  respondedBy: string | null;
  respondedAt: string | null;
  createdAt: string | null;
};

export type DestinatarioConfirmacao = { email: string; name: string; language: string };

function mapRow(r: any): Confirmacao {
  const contrato = Array.isArray(r.contrato) ? r.contrato[0] : r.contrato;
  return {
    id: r.id,
    supplierId: r.supplier_id,
    contratoId: r.contrato_id ?? null,
    estudanteNome: contrato?.estudante_nome ?? null,
    kind: r.kind,
    message: r.message ?? null,
    status: r.status,
    responseNote: r.response_note ?? null,
    requestedBy: r.requested_by ?? null,
    respondedBy: r.responded_by ?? null,
    respondedAt: r.responded_at ?? null,
    createdAt: r.created_at ?? null,
  };
}

const COLS =
  "id, supplier_id, contrato_id, kind, message, status, response_note, requested_by, responded_by, responded_at, created_at, contrato:contratos(estudante_nome)";

// Destinatarios do alerta 5: admissions + admin do fornecedor, ativos e com e-mail.
export async function destinatariosDoFornecedor(
  supabase: SupabaseClient,
  supplierId: string
): Promise<DestinatarioConfirmacao[]> {
  const { data } = await supabase
    .from("supplier_user")
    .select("email, name, role, language, active")
    .eq("supplier_id", supplierId)
    .eq("active", true)
    .is("archived_at", null);
  const vistos = new Set<string>();
  const out: DestinatarioConfirmacao[] = [];
  for (const u of (data ?? []) as any[]) {
    if (!u.email) continue;
    if (u.role !== "admissions" && u.role !== "supplier_admin") continue;
    const email = String(u.email).toLowerCase();
    if (vistos.has(email)) continue;
    vistos.add(email);
    out.push({ email, name: u.name || email, language: u.language === "pt" ? "pt" : "en" });
  }
  return out;
}

// Cria o pedido (admin). Confere: o fornecedor e do tenant; se houver contrato,
// ele tem que ser DESSE fornecedor (consistencia de posse). Retorna o id ou erro.
export async function criarSolicitacao(
  supabase: SupabaseClient,
  tenantId: string,
  requestedBy: string,
  dados: SolicitacaoDados
): Promise<{ ok: true; id: string } | { ok: false; erro: string }> {
  const { data: sup } = await supabase
    .from("supplier")
    .select("id, tenant_id")
    .eq("id", dados.supplierId)
    .maybeSingle();
  if (!sup || (sup as { tenant_id?: string }).tenant_id !== tenantId) {
    return { ok: false, erro: "Fornecedor inválido." };
  }

  if (dados.contratoId) {
    const { data: c } = await supabase
      .from("contratos")
      .select("id, supplier_id")
      .eq("id", dados.contratoId)
      .maybeSingle();
    if (!c || (c as { supplier_id?: string }).supplier_id !== dados.supplierId) {
      return { ok: false, erro: "O contrato não pertence a este fornecedor." };
    }
  }

  const { data: novo, error } = await supabase
    .from("availability_confirmation")
    .insert({
      tenant_id: tenantId,
      supplier_id: dados.supplierId,
      contrato_id: dados.contratoId,
      kind: dados.kind,
      message: dados.message,
      requested_by: requestedBy,
    })
    .select("id")
    .single();
  if (error || !novo) return { ok: false, erro: "Falha ao criar o pedido." };
  return { ok: true, id: novo.id as string };
}

// Pedidos pendentes de um fornecedor (para o Painel do portal).
export async function listarPendentesDoFornecedor(
  supabase: SupabaseClient,
  supplierId: string
): Promise<Confirmacao[]> {
  const { data } = await supabase
    .from("availability_confirmation")
    .select(COLS)
    .eq("supplier_id", supplierId)
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  return (data ?? []).map(mapRow);
}

// Todos os pedidos de um contrato (para o historico no Caso 360).
export async function listarDoContrato(supabase: SupabaseClient, contratoId: string): Promise<Confirmacao[]> {
  const { data } = await supabase
    .from("availability_confirmation")
    .select(COLS)
    .eq("contrato_id", contratoId)
    .order("created_at", { ascending: false });
  return (data ?? []).map(mapRow);
}

// A escola responde (aceitar/recusar). Reconfere a posse (o pedido tem que ser
// desta escola) e que ainda esta pendente. Retorna erro caso contrario.
export async function responderSolicitacao(
  supabase: SupabaseClient,
  supplierId: string,
  id: string,
  dados: RespostaDados,
  respondedBy: string
): Promise<{ ok: boolean; erro?: string }> {
  const { data: pedido } = await supabase
    .from("availability_confirmation")
    .select("id, supplier_id, status")
    .eq("id", id)
    .maybeSingle();
  if (!pedido || (pedido as { supplier_id?: string }).supplier_id !== supplierId) {
    return { ok: false, erro: "Pedido não encontrado." };
  }
  if ((pedido as { status?: string }).status !== "pending") {
    return { ok: false, erro: "Este pedido já foi respondido." };
  }

  const { data: atualizado, error } = await supabase
    .from("availability_confirmation")
    .update({
      status: dados.status,
      response_note: dados.note,
      responded_by: respondedBy,
      responded_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "pending") // guarda final contra corrida
    .select("id");
  if (error) return { ok: false, erro: "Falha ao registrar a resposta." };
  // 0 linhas = outra resposta ganhou a corrida no intervalo; nao mentir "ok".
  if (!atualizado || atualizado.length === 0) {
    return { ok: false, erro: "Este pedido já foi respondido." };
  }
  return { ok: true };
}
