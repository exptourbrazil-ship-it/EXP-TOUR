// Serviço do envio de CONTEÚDO DE PRODUTO pelo fornecedor (Fase B1 curso + B3
// acomodação). SERVER-ONLY (service role). Espelha price-submission-service:
// guarda um RASCUNHO (payload jsonb) e o fluxo de aprovação; a materialização em
// product_content/product_media/(program_detail|accommodation_detail) acontece na
// aprovação do admin (content-admin-service). Posse sempre pelo supplierId.
//
// É KIND-AWARE: kind='program' (curso) ou 'accommodation' (acomodação). O payload
// carrega programDetail OU accommodationDetail conforme o kind.
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  validarConteudoProduto,
  validarProgramDetail,
  validarAccommodationDetail,
  type ConteudoLocale,
  type MidiaItem,
  type ProgramDetailNormalizado,
  type AccommodationDetailNormalizado,
  type Falha,
} from "@/lib/produto-conteudo";

export type ContentStatus = "draft" | "pending_admin" | "approved" | "rejected";
export type ProductContentKind = "program" | "accommodation";

export type ConteudoPayload = {
  content: ConteudoLocale[];
  media: MidiaItem[];
  programDetail?: ProgramDetailNormalizado;
  accommodationDetail?: AccommodationDetailNormalizado;
};

export type ContentSubmissionResumo = {
  id: string;
  productId: string;
  productName: string | null;
  kind: ProductContentKind;
  status: ContentStatus;
  updatedAt: string | null;
  createdAt: string | null;
  rejectReason: string | null;
};

export type ContentSubmissionDetalhe = ContentSubmissionResumo & { payload: ConteudoPayload };

const SEL = "id, product_id, kind, payload, status, reject_reason, created_at, updated_at, product:product_id(name)";
const SEL_OWN = "id, supplier_id, product_id, kind, payload, status, reject_reason, created_at, updated_at, product:product_id(name)";

// Valida e normaliza o payload cru vindo do editor. product_id é do servidor.
export function validarPayloadConteudo(
  productId: string,
  raw: unknown,
  kind: ProductContentKind = "program",
): { ok: true; valor: ConteudoPayload } | { ok: false; falhas: Falha[] } {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const cm = validarConteudoProduto({ product_id: productId, content: o.content, media: o.media });
  if (!cm.ok) return { ok: false, falhas: cm.falhas };
  if (kind === "accommodation") {
    const ad = validarAccommodationDetail(o.accommodationDetail);
    if (!ad.ok) return { ok: false, falhas: ad.falhas };
    return { ok: true, valor: { content: cm.valor.content, media: cm.valor.media, accommodationDetail: ad.valor } };
  }
  const pd = validarProgramDetail(o.programDetail);
  if (!pd.ok) return { ok: false, falhas: pd.falhas };
  return { ok: true, valor: { content: cm.valor.content, media: cm.valor.media, programDetail: pd.valor } };
}

// Posse: o produto tem que ser do KIND pedido e de um campus do fornecedor.
async function produtoDoFornecedor(
  supabase: SupabaseClient,
  supplierId: string,
  productId: string,
  kind: ProductContentKind,
): Promise<boolean> {
  const { data } = await supabase
    .from("product")
    .select("id, kind, campus:campus(supplier_id)")
    .eq("id", productId)
    .maybeSingle();
  if (!data || (data as any).kind !== kind) return false;
  const campus = (data as any).campus;
  const donoId = Array.isArray(campus) ? campus[0]?.supplier_id : campus?.supplier_id;
  return donoId === supplierId;
}

// Lê o conteúdo VIVO do produto para semear o rascunho inicial.
async function conteudoVivo(supabase: SupabaseClient, productId: string, kind: ProductContentKind): Promise<ConteudoPayload> {
  const [{ data: content }, { data: media }] = await Promise.all([
    supabase.from("product_content").select("locale, description_html, highlights, inclusions, exclusions, is_machine_translated").eq("product_id", productId),
    supabase.from("product_media").select("url, kind, sort, caption").eq("product_id", productId).order("sort"),
  ]);
  let detail: Record<string, unknown> = {};
  if (kind === "accommodation") {
    const { data } = await supabase.from("accommodation_detail").select("accommodation_type, room_type, bathroom_type, meal_plan, distance_to_campus_minutes, check_in_weekday, check_out_weekday").eq("product_id", productId).maybeSingle();
    detail = { accommodationDetail: data ?? {} };
  } else {
    const { data } = await supabase.from("program_detail").select("education_type, subject, language, delivery_method, format, institution_type, grades, lessons_per_week, hours_per_week, is_pathway, includes_activities, timetable").eq("product_id", productId).maybeSingle();
    detail = { programDetail: data ?? {} };
  }
  const norm = validarPayloadConteudo(productId, { content: content ?? [], media: media ?? [], ...detail }, kind);
  return norm.ok ? norm.valor : payloadVazio(kind);
}

function payloadVazio(kind: ProductContentKind): ConteudoPayload {
  const base = { content: [], media: [] };
  if (kind === "accommodation") {
    const ad = validarAccommodationDetail({});
    return { ...base, accommodationDetail: ad.ok ? ad.valor : ({} as AccommodationDetailNormalizado) };
  }
  const pd = validarProgramDetail({});
  return { ...base, programDetail: pd.ok ? pd.valor : ({} as ProgramDetailNormalizado) };
}

function mapResumo(r: any): ContentSubmissionResumo {
  const prod = Array.isArray(r.product) ? r.product[0] : r.product;
  return {
    id: r.id,
    productId: r.product_id,
    productName: prod?.name ?? null,
    kind: (r.kind === "accommodation" ? "accommodation" : "program"),
    status: r.status,
    updatedAt: r.updated_at ?? null,
    createdAt: r.created_at ?? null,
    rejectReason: r.reject_reason ?? null,
  };
}

function normalizarPayload(productId: string, raw: unknown, kind: ProductContentKind): ConteudoPayload {
  const r = validarPayloadConteudo(productId, raw, kind);
  return r.ok ? r.valor : payloadVazio(kind);
}

// Retorna a submission ABERTA (draft/pending_admin) do produto, ou cria um
// rascunho semeado do conteúdo vivo. Confere posse (produto do kind do fornecedor).
export async function obterOuCriarRascunho(
  supabase: SupabaseClient,
  args: { tenantId: string; supplierId: string; productId: string; createdBy: string; kind?: ProductContentKind },
): Promise<{ ok: true; detalhe: ContentSubmissionDetalhe } | { ok: false; erro: string }> {
  const kind: ProductContentKind = args.kind ?? "program";
  if (!(await produtoDoFornecedor(supabase, args.supplierId, args.productId, kind))) {
    return { ok: false, erro: kind === "accommodation" ? "Acomodação não encontrada para este fornecedor." : "Programa não encontrado para este fornecedor." };
  }

  const { data: aberta } = await supabase
    .from("content_submission")
    .select(SEL)
    .eq("supplier_id", args.supplierId)
    .eq("product_id", args.productId)
    .in("status", ["draft", "pending_admin"])
    .maybeSingle();
  if (aberta) return { ok: true, detalhe: { ...mapResumo(aberta), payload: normalizarPayload(args.productId, (aberta as any).payload, mapResumo(aberta).kind) } };

  const payload = await conteudoVivo(supabase, args.productId, kind);
  const { data: criada, error } = await supabase
    .from("content_submission")
    .insert({ tenant_id: args.tenantId, supplier_id: args.supplierId, product_id: args.productId, kind, payload, status: "draft", created_by: args.createdBy })
    .select(SEL)
    .single();
  if (error || !criada) {
    const { data: existente } = await supabase
      .from("content_submission")
      .select(SEL)
      .eq("supplier_id", args.supplierId)
      .eq("product_id", args.productId)
      .in("status", ["draft", "pending_admin"])
      .maybeSingle();
    if (existente) return { ok: true, detalhe: { ...mapResumo(existente), payload: normalizarPayload(args.productId, (existente as any).payload, mapResumo(existente).kind) } };
    return { ok: false, erro: "Falha ao iniciar o rascunho de conteúdo." };
  }
  return { ok: true, detalhe: { ...mapResumo(criada), payload: normalizarPayload(args.productId, (criada as any).payload, kind) } };
}

// Produtos do fornecedor de um dado kind (para as telas de conteúdo).
export async function listarProdutosDoFornecedor(
  supabase: SupabaseClient,
  supplierId: string,
  kind: ProductContentKind,
): Promise<{ id: string; name: string }[]> {
  const { data: campi } = await supabase.from("campus").select("id").eq("supplier_id", supplierId).is("archived_at", null);
  const ids = (campi ?? []).map((c: any) => c.id);
  if (ids.length === 0) return [];
  const { data } = await supabase
    .from("product")
    .select("id, name")
    .in("campus_id", ids)
    .eq("kind", kind)
    .is("archived_at", null)
    .order("name");
  return (data ?? []).map((p: any) => ({ id: p.id, name: p.name }));
}

// Lista as submissions do fornecedor de um dado kind (default program).
export async function listarConteudoDoFornecedor(
  supabase: SupabaseClient,
  supplierId: string,
  kind: ProductContentKind = "program",
): Promise<ContentSubmissionResumo[]> {
  const { data } = await supabase
    .from("content_submission")
    .select("id, product_id, kind, status, reject_reason, created_at, updated_at, product:product_id(name)")
    .eq("supplier_id", supplierId)
    .eq("kind", kind)
    .order("updated_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  return (data ?? []).map(mapResumo);
}

export async function obterConteudoDoFornecedor(
  supabase: SupabaseClient,
  supplierId: string,
  id: string,
): Promise<ContentSubmissionDetalhe | null> {
  const { data } = await supabase.from("content_submission").select(SEL_OWN).eq("id", id).maybeSingle();
  if (!data || (data as any).supplier_id !== supplierId) return null;
  const r = mapResumo(data);
  return { ...r, payload: normalizarPayload((data as any).product_id, (data as any).payload, r.kind) };
}

// Salva a edição do rascunho (só enquanto draft). Valida (pelo kind) antes de gravar.
export async function salvarRascunhoConteudo(
  supabase: SupabaseClient,
  supplierId: string,
  id: string,
  payloadRaw: unknown,
): Promise<{ ok: boolean; erro?: string; falhas?: Falha[] }> {
  const atual = await obterConteudoDoFornecedor(supabase, supplierId, id);
  if (!atual) return { ok: false, erro: "Rascunho de conteúdo não encontrado." };
  if (atual.status !== "draft") return { ok: false, erro: "Este conteúdo não está mais em rascunho." };

  const v = validarPayloadConteudo(atual.productId, payloadRaw, atual.kind);
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
    .update({ status: "pending_admin", submitted_by: submittedBy, supplier_approved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("supplier_id", supplierId)
    .eq("status", "draft")
    .select("id");
  if (error) return { ok: false, erro: "Falha ao enviar o conteúdo." };
  if (!data || data.length === 0) return { ok: false, erro: "Este conteúdo já foi enviado." };
  return { ok: true };
}
