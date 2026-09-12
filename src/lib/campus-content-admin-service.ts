// Aprovação/rejeição pelo ADMIN do conteúdo de ESCOLA proposto pelo fornecedor
// (Fase B2). SERVER-ONLY. Aprovar MATERIALIZA em campus_content (por locale) +
// campus_media (substitui) + colunas amenities/accreditations/nationality_mix do
// campus. Posse por tenant. Espelha content-admin-service (curso).
import type { SupabaseClient } from "@supabase/supabase-js";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";
import { validarCampusContentPayload, type CampusContentPayload } from "@/lib/campus-conteudo";

export type CampusAdminResumo = {
  id: string;
  campusId: string;
  campusNome: string | null;
  supplierName: string | null;
  status: string;
  submittedBy: string | null;
  updatedAt: string | null;
};

function mapResumo(r: any): CampusAdminResumo {
  const c = Array.isArray(r.campus) ? r.campus[0] : r.campus;
  const sup = Array.isArray(r.supplier) ? r.supplier[0] : r.supplier;
  return {
    id: r.id,
    campusId: r.campus_id,
    campusNome: c?.name ?? null,
    supplierName: sup?.display_name ?? null,
    status: r.status,
    submittedBy: r.submitted_by ?? null,
    updatedAt: r.updated_at ?? null,
  };
}

export async function listarConteudoCampusPendentesAdmin(supabase: SupabaseClient, tenantId: string): Promise<CampusAdminResumo[]> {
  const { data } = await supabase
    .from("campus_content_submission")
    .select("id, campus_id, status, submitted_by, updated_at, campus:campus_id(name), supplier:supplier_id(display_name)")
    .eq("tenant_id", tenantId)
    .eq("status", "pending_admin")
    .order("updated_at", { ascending: true });
  return (data ?? []).map(mapResumo);
}

export type CampusAdminDetalhe = CampusAdminResumo & { payload: unknown };

export async function obterConteudoCampusDetalheAdmin(supabase: SupabaseClient, tenantId: string, id: string): Promise<CampusAdminDetalhe | null> {
  const { data } = await supabase
    .from("campus_content_submission")
    .select("id, tenant_id, campus_id, payload, status, submitted_by, updated_at, campus:campus_id(name), supplier:supplier_id(display_name)")
    .eq("id", id)
    .maybeSingle();
  if (!data || (data as any).tenant_id !== tenantId) return null;
  return { ...mapResumo(data), payload: (data as any).payload };
}

async function campusDoTenant(supabase: SupabaseClient, tenantId: string, campusId: string): Promise<boolean> {
  const { data } = await supabase.from("campus").select("id, tenant_id").eq("id", campusId).maybeSingle();
  return !!data && (data as any).tenant_id === tenantId;
}

async function snapCampusContent(supabase: SupabaseClient, campusId: string): Promise<any[]> {
  const { data } = await supabase.from("campus_content").select("locale, highlights, highlights_footer, description_html, is_machine_translated").eq("campus_id", campusId);
  return data ?? [];
}
async function snapCampusMedia(supabase: SupabaseClient, campusId: string): Promise<any[]> {
  const { data } = await supabase.from("campus_media").select("url, kind, sort, caption").eq("campus_id", campusId);
  return data ?? [];
}

async function materializarCampus(supabase: SupabaseClient, tenantId: string, campusId: string, v: CampusContentPayload): Promise<void> {
  // Conteúdo (delete + insert por locale).
  const { error: eDelC } = await supabase.from("campus_content").delete().eq("campus_id", campusId);
  if (eDelC) throw new Error(`limpar conteúdo: ${eDelC.message}`);
  if (v.content.length > 0) {
    const rows = v.content.map((c) => ({
      campus_id: campusId,
      locale: c.locale,
      highlights: c.highlights,
      highlights_footer: c.highlights_footer,
      description_html: c.description_html,
      is_machine_translated: c.is_machine_translated,
    }));
    const { error } = await supabase.from("campus_content").insert(rows);
    if (error) throw new Error(`inserir conteúdo: ${error.message}`);
  }
  // Mídia (delete + insert).
  const { error: eDelM } = await supabase.from("campus_media").delete().eq("tenant_id", tenantId).eq("campus_id", campusId);
  if (eDelM) throw new Error(`limpar mídia: ${eDelM.message}`);
  if (v.media.length > 0) {
    const rows = v.media.map((m) => ({ tenant_id: tenantId, campus_id: campusId, url: m.url, kind: m.kind, sort: m.sort, caption: m.caption }));
    const { error } = await supabase.from("campus_media").insert(rows);
    if (error) throw new Error(`inserir mídia: ${error.message}`);
  }
  // Colunas do campus (amenities/accreditations/nationality_mix).
  const { error: eCampus } = await supabase
    .from("campus")
    .update({ amenities: v.amenities, accreditations: v.accreditations, nationality_mix: v.nationalityMix, updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("id", campusId);
  if (eCampus) throw new Error(`atualizar escola: ${eCampus.message}`);
}

export async function aprovarConteudoCampusPeloAdmin(
  supabase: SupabaseClient,
  tenantId: string,
  id: string,
  adminUser: string,
  ip?: string | null,
): Promise<{ ok: boolean; erro?: string }> {
  const det = await obterConteudoCampusDetalheAdmin(supabase, tenantId, id);
  if (!det) return { ok: false, erro: "Conteúdo não encontrado." };
  if (det.status !== "pending_admin") return { ok: false, erro: "Este conteúdo não está pendente de aprovação." };
  if (!(await campusDoTenant(supabase, tenantId, det.campusId))) return { ok: false, erro: "Escola não pertence a este tenant." };

  const v = validarCampusContentPayload(det.payload);
  if (!v.ok) return { ok: false, erro: "O conteúdo está inválido. Peça um novo envio à escola." };

  // Snapshot para restaurar em falha parcial (conteúdo editorial não é dinheiro).
  const snapC = await snapCampusContent(supabase, det.campusId);
  const snapM = await snapCampusMedia(supabase, det.campusId);
  try {
    await materializarCampus(supabase, tenantId, det.campusId, v.valor);
  } catch (e) {
    console.error("[campus-content-admin] materializar falhou:", e instanceof Error ? e.message : e);
    try {
      await supabase.from("campus_content").delete().eq("campus_id", det.campusId);
      if (snapC.length > 0) await supabase.from("campus_content").insert(snapC.map((c) => ({ campus_id: det.campusId, ...c })));
      await supabase.from("campus_media").delete().eq("tenant_id", tenantId).eq("campus_id", det.campusId);
      if (snapM.length > 0) await supabase.from("campus_media").insert(snapM.map((m) => ({ tenant_id: tenantId, campus_id: det.campusId, ...m })));
    } catch (err) {
      console.error("[campus-content-admin] restauracao falhou:", err instanceof Error ? err.message : err);
    }
    return { ok: false, erro: "Falha ao materializar o conteúdo da escola." };
  }

  const { data: aprovadas, error: eStatus } = await supabase
    .from("campus_content_submission")
    .update({ status: "approved", admin_approved_by: adminUser, admin_approved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .eq("status", "pending_admin")
    .select("id");
  if (eStatus) return { ok: false, erro: "Conteúdo materializado, mas falha ao atualizar o status." };
  if (!aprovadas || aprovadas.length === 0) return { ok: true };

  await registrarAuditoriaAdmin(supabase, {
    usuario: adminUser,
    acao: "fornecedores.conteudo_escola.aprovar",
    alvo: det.campusId,
    detalhe: { submissionId: id },
    ip: ip ?? null,
  });
  return { ok: true };
}

export async function rejeitarConteudoCampusPeloAdmin(
  supabase: SupabaseClient,
  tenantId: string,
  id: string,
  adminUser: string,
  motivo: string,
  ip?: string | null,
): Promise<{ ok: boolean; erro?: string }> {
  const det = await obterConteudoCampusDetalheAdmin(supabase, tenantId, id);
  if (!det) return { ok: false, erro: "Conteúdo não encontrado." };
  if (det.status !== "pending_admin") return { ok: false, erro: "Este conteúdo não está pendente." };
  const { data, error } = await supabase
    .from("campus_content_submission")
    .update({ status: "rejected", rejected_by: adminUser, rejected_at: new Date().toISOString(), reject_reason: motivo, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .eq("status", "pending_admin")
    .select("id");
  if (error) return { ok: false, erro: "Falha ao rejeitar." };
  if (!data || data.length === 0) return { ok: false, erro: "Este conteúdo não está mais pendente." };
  await registrarAuditoriaAdmin(supabase, {
    usuario: adminUser,
    acao: "fornecedores.conteudo_escola.rejeitar",
    alvo: det.campusId,
    detalhe: { submissionId: id, motivo },
    ip: ip ?? null,
  });
  return { ok: true };
}
