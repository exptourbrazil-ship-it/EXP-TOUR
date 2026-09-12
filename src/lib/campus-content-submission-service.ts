// Serviço do envio de CONTEÚDO DE ESCOLA (campus) pelo fornecedor (Fase B2).
// SERVER-ONLY (service role). Espelha content-submission-service (curso), mas
// por campus. Posse sempre pelo supplierId. A materialização em campus_content/
// campus_media/campus acontece na aprovação do admin (campus-content-admin-service).
import type { SupabaseClient } from "@supabase/supabase-js";
import { validarCampusContentPayload, type CampusContentPayload, type Falha } from "@/lib/campus-conteudo";

export type CampusStatus = "draft" | "pending_admin" | "approved" | "rejected";

export type CampusSubmissionResumo = {
  id: string;
  campusId: string;
  campusNome: string | null;
  status: CampusStatus;
  updatedAt: string | null;
  createdAt: string | null;
  rejectReason: string | null;
};
export type CampusSubmissionDetalhe = CampusSubmissionResumo & { payload: CampusContentPayload };

export type CampusResumo = { id: string; name: string; city: string | null };

function payloadVazio(): CampusContentPayload {
  return { content: [], media: [], amenities: [], accreditations: [], nationalityMix: [] };
}
function normalizarPayload(raw: unknown): CampusContentPayload {
  const r = validarCampusContentPayload(raw);
  return r.ok ? r.valor : payloadVazio();
}
function mapResumo(r: any): CampusSubmissionResumo {
  const c = Array.isArray(r.campus) ? r.campus[0] : r.campus;
  return {
    id: r.id,
    campusId: r.campus_id,
    campusNome: c?.name ?? null,
    status: r.status,
    updatedAt: r.updated_at ?? null,
    createdAt: r.created_at ?? null,
    rejectReason: r.reject_reason ?? null,
  };
}

// Campi do fornecedor (para a lista).
export async function listarCampiDoFornecedor(supabase: SupabaseClient, supplierId: string): Promise<CampusResumo[]> {
  const { data } = await supabase
    .from("campus")
    .select("id, name, city")
    .eq("supplier_id", supplierId)
    .is("archived_at", null)
    .order("name");
  return (data ?? []).map((c: any) => ({ id: c.id, name: c.name, city: c.city ?? null }));
}

async function campusDoFornecedor(supabase: SupabaseClient, supplierId: string, campusId: string): Promise<boolean> {
  const { data } = await supabase.from("campus").select("id, supplier_id").eq("id", campusId).maybeSingle();
  return !!data && (data as any).supplier_id === supplierId;
}

// Conteúdo VIVO do campus (para semear o rascunho).
async function conteudoVivoCampus(supabase: SupabaseClient, campusId: string): Promise<CampusContentPayload> {
  const [{ data: content }, { data: media }, { data: campus }] = await Promise.all([
    supabase.from("campus_content").select("locale, description_html, highlights, highlights_footer, is_machine_translated").eq("campus_id", campusId),
    supabase.from("campus_media").select("url, kind, sort, caption").eq("campus_id", campusId).order("sort"),
    supabase.from("campus").select("amenities, accreditations, nationality_mix").eq("id", campusId).maybeSingle(),
  ]);
  const r = validarCampusContentPayload({
    content: content ?? [],
    media: media ?? [],
    amenities: campus?.amenities ?? [],
    accreditations: campus?.accreditations ?? [],
    nationalityMix: campus?.nationality_mix ?? [],
  });
  return r.ok ? r.valor : payloadVazio();
}

export async function obterOuCriarRascunhoCampus(
  supabase: SupabaseClient,
  args: { tenantId: string; supplierId: string; campusId: string; createdBy: string },
): Promise<{ ok: true; detalhe: CampusSubmissionDetalhe } | { ok: false; erro: string }> {
  if (!(await campusDoFornecedor(supabase, args.supplierId, args.campusId))) {
    return { ok: false, erro: "Escola não encontrada para este fornecedor." };
  }
  const sel = "id, campus_id, payload, status, reject_reason, created_at, updated_at, campus:campus_id(name)";
  const { data: aberta } = await supabase
    .from("campus_content_submission")
    .select(sel)
    .eq("supplier_id", args.supplierId)
    .eq("campus_id", args.campusId)
    .in("status", ["draft", "pending_admin"])
    .maybeSingle();
  if (aberta) return { ok: true, detalhe: { ...mapResumo(aberta), payload: normalizarPayload((aberta as any).payload) } };

  const payload = await conteudoVivoCampus(supabase, args.campusId);
  const { data: criada, error } = await supabase
    .from("campus_content_submission")
    .insert({ tenant_id: args.tenantId, supplier_id: args.supplierId, campus_id: args.campusId, payload, status: "draft", created_by: args.createdBy })
    .select(sel)
    .single();
  if (error || !criada) {
    const { data: existente } = await supabase
      .from("campus_content_submission")
      .select(sel)
      .eq("supplier_id", args.supplierId)
      .eq("campus_id", args.campusId)
      .in("status", ["draft", "pending_admin"])
      .maybeSingle();
    if (existente) return { ok: true, detalhe: { ...mapResumo(existente), payload: normalizarPayload((existente as any).payload) } };
    return { ok: false, erro: "Falha ao iniciar o rascunho da escola." };
  }
  return { ok: true, detalhe: { ...mapResumo(criada), payload: normalizarPayload((criada as any).payload) } };
}

export async function listarConteudoCampusDoFornecedor(supabase: SupabaseClient, supplierId: string): Promise<CampusSubmissionResumo[]> {
  const { data } = await supabase
    .from("campus_content_submission")
    .select("id, campus_id, status, reject_reason, created_at, updated_at, campus:campus_id(name)")
    .eq("supplier_id", supplierId)
    .order("updated_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  return (data ?? []).map(mapResumo);
}

export async function obterConteudoCampusDoFornecedor(supabase: SupabaseClient, supplierId: string, id: string): Promise<CampusSubmissionDetalhe | null> {
  const { data } = await supabase
    .from("campus_content_submission")
    .select("id, supplier_id, campus_id, payload, status, reject_reason, created_at, updated_at, campus:campus_id(name)")
    .eq("id", id)
    .maybeSingle();
  if (!data || (data as any).supplier_id !== supplierId) return null;
  return { ...mapResumo(data), payload: normalizarPayload((data as any).payload) };
}

export async function salvarRascunhoCampus(
  supabase: SupabaseClient,
  supplierId: string,
  id: string,
  payloadRaw: unknown,
): Promise<{ ok: boolean; erro?: string; falhas?: Falha[] }> {
  const atual = await obterConteudoCampusDoFornecedor(supabase, supplierId, id);
  if (!atual) return { ok: false, erro: "Rascunho não encontrado." };
  if (atual.status !== "draft") return { ok: false, erro: "Este conteúdo não está mais em rascunho." };
  const v = validarCampusContentPayload(payloadRaw);
  if (!v.ok) return { ok: false, erro: "Há campos inválidos.", falhas: v.falhas };
  const { error } = await supabase
    .from("campus_content_submission")
    .update({ payload: v.valor, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("supplier_id", supplierId)
    .eq("status", "draft");
  if (error) return { ok: false, erro: "Falha ao salvar o rascunho." };
  return { ok: true };
}

export async function enviarConteudoCampusParaAdmin(
  supabase: SupabaseClient,
  supplierId: string,
  id: string,
  submittedBy: string,
): Promise<{ ok: boolean; erro?: string }> {
  const atual = await obterConteudoCampusDoFornecedor(supabase, supplierId, id);
  if (!atual) return { ok: false, erro: "Rascunho não encontrado." };
  if (atual.status !== "draft") return { ok: false, erro: "Este conteúdo já foi enviado." };
  const { data, error } = await supabase
    .from("campus_content_submission")
    .update({ status: "pending_admin", submitted_by: submittedBy, supplier_approved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("supplier_id", supplierId)
    .eq("status", "draft")
    .select("id");
  if (error) return { ok: false, erro: "Falha ao enviar o conteúdo." };
  if (!data || data.length === 0) return { ok: false, erro: "Este conteúdo já foi enviado." };
  return { ok: true };
}
