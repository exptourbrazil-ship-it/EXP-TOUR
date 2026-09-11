// NB: modulo server-only (service role). So deve ser importado por rotas de API.
//
// Mutacoes nomeadas do LEAD (funil do orcamento). Padrao do handoff: valida ->
// executa -> grava evento em `events` -> grava a trilha em `audit`. A conversao
// do lead em CLIENTE (titular verificado) + cotacao e um passo proprio (proxima
// fatia); aqui so movimentamos o status do funil de captacao.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { statusLeadValido, podeTransicionarLead, type StatusLead } from "@/lib/leads";
import { tenantIdAtual } from "@/lib/catalog-service";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";

export class LeadInvalido extends Error {
  codigo: string;
  constructor(codigo: string, mensagem?: string) {
    super(mensagem || codigo);
    this.name = "LeadInvalido";
    this.codigo = codigo;
  }
}

function getSupabase(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );
}

export type EntradaStatusLead = {
  leadId: string;
  novoStatus: string;
  autor: string;
  ip?: string | null;
};

export type ResultadoStatusLead = { ok: true; leadId: string; status: StatusLead };

// Move o lead para outro status do funil, respeitando as transicoes permitidas
// (leads.ts). NAO permite marcar 'convertido' por aqui — isso so acontece na
// conversao em cliente. A autorizacao por PAPEL (propostas.gerir) e feita na rota.
export async function atualizarStatusLead(args: EntradaStatusLead): Promise<ResultadoStatusLead> {
  if (!statusLeadValido(args.novoStatus)) {
    throw new LeadInvalido("status_invalido", "Status de lead inválido.");
  }
  const novo = args.novoStatus as StatusLead;
  if (novo === "convertido") {
    throw new LeadInvalido("conversao_direta_bloqueada", "Converter em cliente é uma ação própria, não uma troca de status.");
  }

  const supabase = getSupabase();
  const tenantId = await tenantIdAtual(supabase); // escopo do tenant: nao movimenta lead de outro tenant
  const { data: atual, error: erroLeitura } = await supabase
    .from("lead")
    .select("id, status")
    .eq("id", args.leadId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (erroLeitura) throw new LeadInvalido("falha_leitura", "Falha ao ler o lead.");
  if (!atual) throw new LeadInvalido("nao_encontrado", "Lead não encontrado.");

  const de = statusLeadValido(atual.status) ? (atual.status as StatusLead) : "novo";
  if (de === novo) {
    // No-op idempotente: ja esta no status pedido.
    return { ok: true, leadId: args.leadId, status: novo };
  }
  if (!podeTransicionarLead(de, novo)) {
    throw new LeadInvalido("transicao_invalida", `Não é possível ir de "${de}" para "${novo}".`);
  }

  const { error: erroUpdate } = await supabase
    .from("lead")
    .update({ status: novo, updated_at: new Date().toISOString() })
    .eq("id", args.leadId)
    .eq("tenant_id", tenantId);
  if (erroUpdate) throw new LeadInvalido("falha_update", "Falha ao atualizar o status do lead.");

  // Evento (ledger) + auditoria — best-effort, nao derrubam a mudanca ja gravada.
  // Chave deterministica por ARESTA (de->para): um duplo-clique/retry nao insere
  // duplicata no ledger. A trilha completa (com timestamp de cada troca) fica no
  // admin_audit; aqui o evento e o eco da mutacao no barramento.
  try {
    await supabase.from("events").insert({
      source: "admin",
      event_type: "Lead_Status_Alterado",
      idempotency_key: `lead-status:${args.leadId}:${de}:${novo}`,
      payload: { lead_id: args.leadId, de, para: novo, autor: args.autor },
      status: "processado",
      processed_at: new Date().toISOString(),
    });
  } catch {
    // Nao derruba a mudanca ja gravada; loga sem PII para o defeito nao sumir.
    console.error("[leads-service] falha ao gravar evento Lead_Status_Alterado no ledger");
  }
  try {
    await registrarAuditoriaAdmin(supabase, {
      usuario: args.autor,
      acao: "lead.status.alterar",
      alvo: args.leadId,
      detalhe: { de, para: novo },
      ip: args.ip ?? null,
    });
  } catch { /* best-effort */ }

  return { ok: true, leadId: args.leadId, status: novo };
}
