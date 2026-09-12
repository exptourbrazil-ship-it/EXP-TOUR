// Aprovação/rejeição pelo ADMIN do conteúdo de PRODUTO proposto pelo fornecedor
// (Fase B1 curso + B3 acomodação). SERVER-ONLY (service role). A aprovação
// MATERIALIZA o payload em product_content / product_media (via
// salvarConteudoProduto) + program_detail OU accommodation_detail (upsert),
// conforme o kind. Espelha price-admin-service. Posse por tenant.
import type { SupabaseClient } from "@supabase/supabase-js";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";
import { salvarConteudoProduto } from "@/lib/produto-conteudo-admin-service";
import { validarProgramDetail, validarAccommodationDetail, type ProgramDetailNormalizado, type AccommodationDetailNormalizado } from "@/lib/produto-conteudo";

export type ContentKind = "program" | "accommodation";

export type ContentAdminResumo = {
  id: string;
  productId: string;
  productName: string | null;
  supplierName: string | null;
  kind: ContentKind;
  status: string;
  submittedBy: string | null;
  updatedAt: string | null;
};

function mapResumo(r: any): ContentAdminResumo {
  const prod = Array.isArray(r.product) ? r.product[0] : r.product;
  const sup = Array.isArray(r.supplier) ? r.supplier[0] : r.supplier;
  return {
    id: r.id,
    productId: r.product_id,
    productName: prod?.name ?? null,
    supplierName: sup?.display_name ?? sup?.name ?? null,
    kind: (r.kind === "accommodation" ? "accommodation" : "program"),
    status: r.status,
    submittedBy: r.submitted_by ?? null,
    updatedAt: r.updated_at ?? null,
  };
}

// Fila de conteúdo pendente de aprovação (pending_admin), do tenant, por kind.
export async function listarConteudoPendentesAdmin(
  supabase: SupabaseClient,
  tenantId: string,
  kind: ContentKind = "program",
): Promise<ContentAdminResumo[]> {
  const { data } = await supabase
    .from("content_submission")
    .select("id, product_id, kind, status, submitted_by, updated_at, product:product_id(name), supplier:supplier_id(display_name)")
    .eq("tenant_id", tenantId)
    .eq("kind", kind)
    .eq("status", "pending_admin")
    .order("updated_at", { ascending: true });
  return (data ?? []).map(mapResumo);
}

export type ContentAdminDetalhe = ContentAdminResumo & { payload: unknown };

export async function obterConteudoDetalheAdmin(
  supabase: SupabaseClient,
  tenantId: string,
  id: string,
  kind?: ContentKind, // quando informado, exige que a submission seja desse kind
): Promise<ContentAdminDetalhe | null> {
  const { data } = await supabase
    .from("content_submission")
    .select("id, tenant_id, product_id, kind, payload, status, submitted_by, updated_at, product:product_id(name), supplier:supplier_id(display_name)")
    .eq("id", id)
    .maybeSingle();
  if (!data || (data as any).tenant_id !== tenantId) return null;
  const r = mapResumo(data);
  if (kind && r.kind !== kind) return null;
  return { ...r, payload: (data as any).payload };
}

function linhaProgramDetail(productId: string, pd: ProgramDetailNormalizado) {
  return {
    product_id: productId,
    education_type: pd.education_type,
    subject: pd.subject,
    language: pd.language,
    delivery_method: pd.delivery_method,
    format: pd.format,
    institution_type: pd.institution_type,
    grades: pd.grades,
    lessons_per_week: pd.lessons_per_week,
    hours_per_week: pd.hours_per_week,
    is_pathway: pd.is_pathway,
    includes_activities: pd.includes_activities,
    timetable: pd.timetable,
  };
}

function linhaAccommodationDetail(productId: string, ad: AccommodationDetailNormalizado) {
  return {
    product_id: productId,
    accommodation_type: ad.accommodation_type,
    room_type: ad.room_type,
    bathroom_type: ad.bathroom_type,
    meal_plan: ad.meal_plan,
    distance_to_campus_minutes: ad.distance_to_campus_minutes,
    check_in_weekday: ad.check_in_weekday,
    check_out_weekday: ad.check_out_weekday,
  };
}

// Aprova e MATERIALIZA: product_content + product_media (salvarConteudoProduto)
// e program_detail (upsert). Depois marca a submission como approved. Idempotente
// (a materialização substitui). Posse por tenant.
export async function aprovarConteudoPeloAdmin(
  supabase: SupabaseClient,
  tenantId: string,
  id: string,
  adminUser: string,
  ip?: string | null,
): Promise<{ ok: boolean; erro?: string }> {
  const det = await obterConteudoDetalheAdmin(supabase, tenantId, id);
  if (!det) return { ok: false, erro: "Conteúdo não encontrado." };
  if (det.status !== "pending_admin") return { ok: false, erro: "Este conteúdo não está pendente de aprovação." };

  const payload = (det.payload && typeof det.payload === "object" ? det.payload : {}) as Record<string, unknown>;

  // Revalida a ficha (pelo kind) ANTES de materializar — evita materializar só
  // metade (content/media) e pular o detail silenciosamente.
  const pdv = det.kind === "program" ? validarProgramDetail(payload.programDetail) : null;
  const adv = det.kind === "accommodation" ? validarAccommodationDetail(payload.accommodationDetail) : null;
  if (pdv && !pdv.ok) return { ok: false, erro: "A ficha do curso está inválida. Peça um novo envio à escola." };
  if (adv && !adv.ok) return { ok: false, erro: "A ficha da acomodação está inválida. Peça um novo envio à escola." };

  // Materializa conteúdo + mídia (valida posse por tenant lá dentro + auditoria própria).
  try {
    await salvarConteudoProduto(supabase, {
      tenantId,
      actor: adminUser,
      ip: ip ?? null,
      productId: det.productId,
      content: payload.content ?? [],
      media: payload.media ?? [],
    });
  } catch (e) {
    console.error("[content-admin] materializar conteudo/midia falhou:", e instanceof Error ? e.message : e);
    return { ok: false, erro: "Falha ao materializar o conteúdo." };
  }

  // Materializa a ficha (program_detail OU accommodation_detail) por upsert.
  if (pdv && pdv.ok) {
    const { error } = await supabase.from("program_detail").upsert(linhaProgramDetail(det.productId, pdv.valor), { onConflict: "product_id" });
    if (error) {
      console.error("[content-admin] upsert program_detail falhou:", error.message);
      return { ok: false, erro: "Falha ao materializar a ficha do curso." };
    }
  } else if (adv && adv.ok) {
    const { error } = await supabase.from("accommodation_detail").upsert(linhaAccommodationDetail(det.productId, adv.valor), { onConflict: "product_id" });
    if (error) {
      console.error("[content-admin] upsert accommodation_detail falhou:", error.message);
      return { ok: false, erro: "Falha ao materializar a ficha da acomodação." };
    }
  }

  // Marca approved guardado por status (anti-corrida): 0 linhas = já processado.
  const { data: aprovadas, error: eStatus } = await supabase
    .from("content_submission")
    .update({ status: "approved", admin_approved_by: adminUser, admin_approved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .eq("status", "pending_admin")
    .select("id");
  if (eStatus) return { ok: false, erro: "Conteúdo materializado, mas falha ao atualizar o status." };
  if (!aprovadas || aprovadas.length === 0) return { ok: true }; // outra aprovação concorrente já concluiu

  await registrarAuditoriaAdmin(supabase, {
    usuario: adminUser,
    acao: "fornecedores.conteudo.aprovar",
    alvo: det.productId,
    detalhe: { submissionId: id, kind: det.kind },
    ip: ip ?? null,
  });
  return { ok: true };
}

export async function rejeitarConteudoPeloAdmin(
  supabase: SupabaseClient,
  tenantId: string,
  id: string,
  adminUser: string,
  motivo: string,
  ip?: string | null,
): Promise<{ ok: boolean; erro?: string }> {
  const det = await obterConteudoDetalheAdmin(supabase, tenantId, id);
  if (!det) return { ok: false, erro: "Conteúdo não encontrado." };
  if (det.status !== "pending_admin") return { ok: false, erro: "Este conteúdo não está pendente." };

  const { data, error } = await supabase
    .from("content_submission")
    .update({ status: "rejected", rejected_by: adminUser, rejected_at: new Date().toISOString(), reject_reason: motivo, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .eq("status", "pending_admin")
    .select("id");
  if (error) return { ok: false, erro: "Falha ao rejeitar o conteúdo." };
  if (!data || data.length === 0) return { ok: false, erro: "Este conteúdo não está mais pendente." };

  await registrarAuditoriaAdmin(supabase, {
    usuario: adminUser,
    acao: "fornecedores.conteudo.rejeitar",
    alvo: det.productId,
    detalhe: { submissionId: id, motivo },
    ip: ip ?? null,
  });
  return { ok: true };
}
