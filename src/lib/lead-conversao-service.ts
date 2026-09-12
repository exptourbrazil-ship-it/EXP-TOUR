// Conversão de LEAD → COTAÇÃO em rascunho (Fatia 2 da matrícula). SERVER-ONLY.
// Semeia uma cotação (aluno + opção + programa escolhido) a partir do lead e a
// abre no construtor; daí o consultor refina/emite. A partir da emissão, o
// pipeline existente (portal Edvisor → aceite → converter_cotacao) cria o
// titular verificado + contrato + parcelas + e-mail de acesso; o PIX é
// autosserviço na Área do Cliente. Não cria conta login-capável aqui.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createStudent, createQuote, addQuoteOption, addQuoteItem } from "@/lib/quote-service";
import { tenantIdAtual } from "@/lib/catalog-service";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";

export class LeadConversaoInvalida extends Error {
  codigo: string;
  constructor(codigo: string, mensagem?: string) {
    super(mensagem || codigo);
    this.name = "LeadConversaoInvalida";
    this.codigo = codigo;
  }
}

function getSupabase(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string);
}

function hojeBrasilISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

function splitNome(full: string): { first: string; last: string } {
  const partes = (full || "").trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return { first: "Aluno", last: "-" };
  if (partes.length === 1) return { first: partes[0], last: "-" };
  return { first: partes[0], last: partes.slice(1).join(" ") };
}

// admin_users.id (uuid) a partir do e-mail da sessão — quote.owner_user_id é uuid.
async function resolveOwnerId(supabase: SupabaseClient, email: string): Promise<string | null> {
  if (!email) return null;
  const { data } = await supabase.from("admin_users").select("id").eq("email", email).maybeSingle();
  return (data?.id as string) ?? null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ConverterLeadArgs = { leadId: string; actorEmail: string; ip?: string | null };
export type ConverterLeadResultado = { ok: true; quoteId: string; jaExistia: boolean; itemAdicionado: boolean; aviso?: string };

export async function converterLeadEmCotacao(args: ConverterLeadArgs): Promise<ConverterLeadResultado> {
  const supabase = getSupabase();
  const tenantId = await tenantIdAtual(supabase);

  const { data: lead, error } = await supabase
    .from("lead")
    .select("id, tenant_id, nome, email, participante_nome, programa_id, params, status, quote_id")
    .eq("id", args.leadId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new LeadConversaoInvalida("falha_leitura", "Falha ao ler o lead.");
  if (!lead) throw new LeadConversaoInvalida("nao_encontrado", "Lead não encontrado.");
  if (lead.status === "convertido") throw new LeadConversaoInvalida("ja_convertido", "Este lead já foi convertido.");

  // Idempotente: se já há cotação vinculada, reabre a mesma.
  if (lead.quote_id) {
    return { ok: true, quoteId: lead.quote_id as string, jaExistia: true, itemAdicionado: false };
  }

  const ownerUserId = await resolveOwnerId(supabase, args.actorEmail);
  if (!ownerUserId) {
    throw new LeadConversaoInvalida("sem_dono", "Seu usuário não está em admin_users — não foi possível definir o dono da cotação.");
  }

  // Aluno: o participante quando houver, senão o próprio titular do lead.
  const nomeAluno = (lead.participante_nome as string) || (lead.nome as string) || "Aluno";
  const { first, last } = splitNome(nomeAluno);
  const { studentId } = await createStudent(supabase, { tenantId, firstName: first, lastName: last, email: (lead.email as string) || undefined }, { usuario: args.actorEmail, ip: args.ip ?? null });

  const { quoteId } = await createQuote(supabase, { tenantId, studentId, ownerUserId }, { usuario: args.actorEmail, ip: args.ip ?? null });
  const { optionId } = await addQuoteOption(supabase, { tenantId, quoteId }, { usuario: args.actorEmail, ip: args.ip ?? null });

  // Semeia o programa escolhido, se houver id + datas. Falha de precificação NÃO
  // derruba a conversão — o consultor completa/ajusta no construtor.
  let itemAdicionado = false;
  let aviso: string | undefined;
  const params = (lead.params && typeof lead.params === "object" ? lead.params : {}) as Record<string, unknown>;
  const programaId = String(lead.programa_id ?? "");
  const inicio = typeof params.inicio === "string" ? params.inicio : "";
  const weeks = Number(params.weeks);
  if (UUID_RE.test(programaId) && inicio && Number.isFinite(weeks) && weeks > 0) {
    try {
      await addQuoteItem(supabase, { tenantId, optionId, productId: programaId, startDate: inicio, quantity: weeks, unit: "week", quoteDate: hojeBrasilISO() }, { usuario: args.actorEmail, ip: args.ip ?? null });
      itemAdicionado = true;
    } catch (e) {
      aviso = "Cotação criada, mas o programa não pôde ser precificado automaticamente — adicione o item no construtor.";
      console.warn("[lead-conversao] addQuoteItem falhou:", e instanceof Error ? e.message : e);
    }
  } else {
    aviso = "Cotação criada sem item — adicione o programa no construtor.";
  }

  // Vincula lead → cotação de forma ATÔMICA: só grava se o lead ainda não tem
  // cotação (.is null). Em corrida (dois POSTs), o perdedor apaga o que criou e
  // reabre a cotação vencedora — evita student/quote órfãos e duplicados.
  const { data: linked } = await supabase
    .from("lead")
    .update({ quote_id: quoteId, status: "cotacao", updated_at: new Date().toISOString() })
    .eq("id", args.leadId)
    .eq("tenant_id", tenantId)
    .is("quote_id", null)
    .select("id");
  if (!linked || linked.length === 0) {
    // Outro POST venceu: limpa o que criamos (cascata apaga option/item) e reabre.
    await supabase.from("quote").delete().eq("id", quoteId).eq("tenant_id", tenantId);
    await supabase.from("student").delete().eq("id", studentId).eq("tenant_id", tenantId);
    const { data: atual } = await supabase.from("lead").select("quote_id").eq("id", args.leadId).eq("tenant_id", tenantId).maybeSingle();
    const outra = (atual?.quote_id as string) ?? null;
    if (outra) return { ok: true, quoteId: outra, jaExistia: true, itemAdicionado: false };
    throw new LeadConversaoInvalida("falha_vinculo", "Não foi possível vincular a cotação ao lead.");
  }

  try {
    await supabase.from("events").insert({
      source: "admin",
      event_type: "Lead_Convertido_Cotacao",
      idempotency_key: `lead-cotacao:${args.leadId}:${quoteId}`,
      payload: { lead_id: args.leadId, quote_id: quoteId, item_adicionado: itemAdicionado },
      status: "processado",
      processed_at: new Date().toISOString(),
    });
  } catch {
    console.error("[lead-conversao] falha ao gravar evento no ledger");
  }
  await registrarAuditoriaAdmin(supabase, {
    usuario: args.actorEmail,
    acao: "lead.converter_cotacao",
    alvo: args.leadId,
    detalhe: { quote_id: quoteId, item_adicionado: itemAdicionado },
    ip: args.ip ?? null,
  });

  return { ok: true, quoteId, jaExistia: false, itemAdicionado, aviso };
}
