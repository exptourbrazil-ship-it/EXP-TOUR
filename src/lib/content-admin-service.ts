// Aprovação/rejeição pelo ADMIN do conteúdo de programa proposto pelo fornecedor
// (Fase B1). SERVER-ONLY (service role). A aprovação MATERIALIZA o payload em
// product_content / product_media (via salvarConteudoProduto) + program_detail
// (upsert). Espelha price-admin-service. Posse por tenant.
import type { SupabaseClient } from "@supabase/supabase-js";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";
import { salvarConteudoProduto } from "@/lib/produto-conteudo-admin-service";
import { validarProgramDetail, type ProgramDetailNormalizado } from "@/lib/produto-conteudo";

export type ContentAdminResumo = {
  id: string;
  productId: string;
  productName: string | null;
  supplierName: string | null;
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
    status: r.status,
    submittedBy: r.submitted_by ?? null,
    updatedAt: r.updated_at ?? null,
  };
}

// Fila de conteúdo pendente de aprovação (pending_admin), do tenant.
export async function listarConteudoPendentesAdmin(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<ContentAdminResumo[]> {
  const { data } = await supabase
    .from("content_submission")
    .select("id, product_id, status, submitted_by, updated_at, product:product_id(name), supplier:supplier_id(display_name)")
    .eq("tenant_id", tenantId)
    .eq("status", "pending_admin")
    .order("updated_at", { ascending: true });
  return (data ?? []).map(mapResumo);
}

export type ContentAdminDetalhe = ContentAdminResumo & { payload: unknown };

export async function obterConteudoDetalheAdmin(
  supabase: SupabaseClient,
  tenantId: string,
  id: string,
): Promise<ContentAdminDetalhe | null> {
  const { data } = await supabase
    .from("content_submission")
    .select("id, tenant_id, product_id, payload, status, submitted_by, updated_at, product:product_id(name), supplier:supplier_id(display_name)")
    .eq("id", id)
    .maybeSingle();
  if (!data || (data as any).tenant_id !== tenantId) return null;
  return { ...mapResumo(data), payload: (data as any).payload };
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

  // Revalida a ficha ANTES de materializar — evita materializar só metade
  // (content/media) e pular program_detail silenciosamente.
  const pdv = validarProgramDetail(payload.programDetail);
  if (!pdv.ok) return { ok: false, erro: "A ficha do curso está inválida. Peça um novo envio à escola." };

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

  // Materializa program_detail (upsert).
  const { error: ePd } = await supabase
    .from("program_detail")
    .upsert(linhaProgramDetail(det.productId, pdv.valor), { onConflict: "product_id" });
  if (ePd) {
    console.error("[content-admin] upsert program_detail falhou:", ePd.message);
    return { ok: false, erro: "Falha ao materializar a ficha do curso." };
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
    detalhe: { submissionId: id },
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
