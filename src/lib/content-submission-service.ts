// Serviço do envio de CONTEÚDO DE PROGRAMA pelo fornecedor (Fase B1).
// SERVER-ONLY (service role). Espelha price-submission-service: guarda um
// RASCUNHO (payload jsonb) e o fluxo de aprovação; nada de conteúdo vivo aqui —
// a materialização em product_content/product_media/program_detail acontece na
// aprovação do admin (content-admin-service). Posse sempre pelo supplierId.
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  validarConteudoProduto,
  validarProgramDetail,
  type ConteudoLocale,
  type MidiaItem,
  type ProgramDetailNormalizado,
  type Falha,
} from "@/lib/produto-conteudo";

export type ContentStatus = "draft" | "pending_admin" | "approved" | "rejected";

export type ConteudoPayload = {
  content: ConteudoLocale[];
  media: MidiaItem[];
  programDetail: ProgramDetailNormalizado;
};

export type ContentSubmissionResumo = {
  id: string;
  productId: string;
  productName: string | null;
  status: ContentStatus;
  updatedAt: string | null;
  createdAt: string | null;
  rejectReason: string | null;
};

export type ContentSubmissionDetalhe = ContentSubmissionResumo & { payload: ConteudoPayload };

// Valida e normaliza o payload cru vindo do editor. product_id é do servidor.
export function validarPayloadConteudo(
  productId: string,
  raw: unknown,
): { ok: true; valor: ConteudoPayload } | { ok: false; falhas: Falha[] } {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const cm = validarConteudoProduto({ product_id: productId, content: o.content, media: o.media });
  if (!cm.ok) return { ok: false, falhas: cm.falhas };
  const pd = validarProgramDetail(o.programDetail);
  if (!pd.ok) return { ok: false, falhas: pd.falhas };
  return { ok: true, valor: { content: cm.valor.content, media: cm.valor.media, programDetail: pd.valor } };
}

// Posse: o produto tem que ser um PROGRAMA de um campus do fornecedor.
async function programaDoFornecedor(
  supabase: SupabaseClient,
  supplierId: string,
  productId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("product")
    .select("id, kind, campus:campus(supplier_id)")
    .eq("id", productId)
    .maybeSingle();
  if (!data || (data as any).kind !== "program") return false;
  const campus = (data as any).campus;
  const donoId = Array.isArray(campus) ? campus[0]?.supplier_id : campus?.supplier_id;
  return donoId === supplierId;
}

// Lê o conteúdo VIVO do produto para semear o rascunho inicial.
async function conteudoVivo(supabase: SupabaseClient, productId: string): Promise<ConteudoPayload> {
  const [{ data: content }, { data: media }, { data: pd }] = await Promise.all([
    supabase.from("product_content").select("locale, description_html, highlights, inclusions, exclusions, is_machine_translated").eq("product_id", productId),
    supabase.from("product_media").select("url, kind, sort, caption").eq("product_id", productId).order("sort"),
    supabase.from("program_detail").select("education_type, subject, language, delivery_method, format, institution_type, grades, lessons_per_week, hours_per_week, is_pathway, includes_activities, timetable").eq("product_id", productId).maybeSingle(),
  ]);
  // Normaliza pelo validador (garante shapes) — conteúdo vivo já é confiável.
  const norm = validarPayloadConteudo(productId, { content: content ?? [], media: media ?? [], programDetail: pd ?? {} });
  if (norm.ok) return norm.valor;
  // fallback defensivo: payload vazio
  return { content: [], media: [], programDetail: validarProgramDetail({}).ok ? (validarProgramDetail({}) as any).valor : ({} as ProgramDetailNormalizado) };
}

function mapResumo(r: any): ContentSubmissionResumo {
  const prod = Array.isArray(r.product) ? r.product[0] : r.product;
  return {
    id: r.id,
    productId: r.product_id,
    productName: prod?.name ?? null,
    status: r.status,
    updatedAt: r.updated_at ?? null,
    createdAt: r.created_at ?? null,
    rejectReason: r.reject_reason ?? null,
  };
}

// Retorna a submission ABERTA (draft/pending_admin) do produto, ou cria um
// rascunho semeado do conteúdo vivo. Confere posse (programa do fornecedor).
export async function obterOuCriarRascunho(
  supabase: SupabaseClient,
  args: { tenantId: string; supplierId: string; productId: string; createdBy: string },
): Promise<{ ok: true; detalhe: ContentSubmissionDetalhe } | { ok: false; erro: string }> {
  if (!(await programaDoFornecedor(supabase, args.supplierId, args.productId))) {
    return { ok: false, erro: "Programa não encontrado para este fornecedor." };
  }

  const { data: aberta } = await supabase
    .from("content_submission")
    .select("id, product_id, payload, status, reject_reason, created_at, updated_at, product:product_id(name)")
    .eq("supplier_id", args.supplierId)
    .eq("product_id", args.productId)
    .in("status", ["draft", "pending_admin"])
    .maybeSingle();
  if (aberta) {
    return { ok: true, detalhe: { ...mapResumo(aberta), payload: normalizarPayload(args.productId, (aberta as any).payload) } };
  }

  const payload = await conteudoVivo(supabase, args.productId);
  const { data: criada, error } = await supabase
    .from("content_submission")
    .insert({
      tenant_id: args.tenantId,
      supplier_id: args.supplierId,
      product_id: args.productId,
      kind: "program",
      payload,
      status: "draft",
      created_by: args.createdBy,
    })
    .select("id, product_id, payload, status, reject_reason, created_at, updated_at, product:product_id(name)")
    .single();
  if (error || !criada) {
    // Corrida: o índice único (1 aberta por produto) pode ter barrado um insert
    // concorrente — re-busca a submission aberta e a devolve (upsert-like).
    const { data: existente } = await supabase
      .from("content_submission")
      .select("id, product_id, payload, status, reject_reason, created_at, updated_at, product:product_id(name)")
      .eq("supplier_id", args.supplierId)
      .eq("product_id", args.productId)
      .in("status", ["draft", "pending_admin"])
      .maybeSingle();
    if (existente) {
      return { ok: true, detalhe: { ...mapResumo(existente), payload: normalizarPayload(args.productId, (existente as any).payload) } };
    }
    return { ok: false, erro: "Falha ao iniciar o rascunho de conteúdo." };
  }
  return { ok: true, detalhe: { ...mapResumo(criada), payload: normalizarPayload(args.productId, (criada as any).payload) } };
}

function normalizarPayload(productId: string, raw: unknown): ConteudoPayload {
  const r = validarPayloadConteudo(productId, raw);
  if (r.ok) return r.valor;
  const pd = validarProgramDetail({});
  return { content: [], media: [], programDetail: pd.ok ? pd.valor : ({} as ProgramDetailNormalizado) };
}

export async function listarConteudoDoFornecedor(
  supabase: SupabaseClient,
  supplierId: string,
): Promise<ContentSubmissionResumo[]> {
  const { data } = await supabase
    .from("content_submission")
    .select("id, product_id, status, reject_reason, created_at, updated_at, product:product_id(name)")
    .eq("supplier_id", supplierId)
    .order("updated_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  return (data ?? []).map(mapResumo);
}

export async function obterConteudoDoFornecedor(
  supabase: SupabaseClient,
  supplierId: string,
  id: string,
): Promise<ContentSubmissionDetalhe | null> {
  const { data } = await supabase
    .from("content_submission")
    .select("id, supplier_id, product_id, payload, status, reject_reason, created_at, updated_at, product:product_id(name)")
    .eq("id", id)
    .maybeSingle();
  if (!data || (data as any).supplier_id !== supplierId) return null;
  return { ...mapResumo(data), payload: normalizarPayload((data as any).product_id, (data as any).payload) };
}

// Salva a edição do rascunho (só enquanto draft). Valida antes de gravar.
export async function salvarRascunhoConteudo(
  supabase: SupabaseClient,
  supplierId: string,
  id: string,
  payloadRaw: unknown,
): Promise<{ ok: boolean; erro?: string; falhas?: Falha[] }> {
  const atual = await obterConteudoDoFornecedor(supabase, supplierId, id);
  if (!atual) return { ok: false, erro: "Rascunho de conteúdo não encontrado." };
  if (atual.status !== "draft") return { ok: false, erro: "Este conteúdo não está mais em rascunho." };

  const v = validarPayloadConteudo(atual.productId, payloadRaw);
  if (!v.ok) return { ok: false, erro: "Há campos inválidos.", falhas: v.falhas };

  const { error } = await supabase
    .from("content_submission")
    .update({ payload: v.valor, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("supplier_id", supplierId)
    .eq("status", "draft");
  if (error) return { ok: false, erro: "Falha ao salvar o rascunho." };
  return { ok: true };
}

// A escola envia para a EXP Tour (draft -> pending_admin). Guarda contra corrida.
export async function enviarConteudoParaAdmin(
  supabase: SupabaseClient,
  supplierId: string,
  id: string,
  submittedBy: string,
): Promise<{ ok: boolean; erro?: string }> {
  const atual = await obterConteudoDoFornecedor(supabase, supplierId, id);
  if (!atual) return { ok: false, erro: "Rascunho de conteúdo não encontrado." };
  if (atual.status !== "draft") return { ok: false, erro: "Este conteúdo já foi enviado." };

  const { data, error } = await supabase
    .from("content_submission")
    .update({
      status: "pending_admin",
      submitted_by: submittedBy,
      supplier_approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("supplier_id", supplierId)
    .eq("status", "draft")
    .select("id");
  if (error) return { ok: false, erro: "Falha ao enviar o conteúdo." };
  if (!data || data.length === 0) return { ok: false, erro: "Este conteúdo já foi enviado." };
  return { ok: true };
}
