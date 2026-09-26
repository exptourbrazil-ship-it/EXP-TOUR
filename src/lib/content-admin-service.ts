// Aprovação/rejeição pelo ADMIN do conteúdo de PRODUTO proposto pelo fornecedor
// (Fase B1 curso + B3 acomodação). SERVER-ONLY (service role). A aprovação
// MATERIALIZA o payload em product_content / product_media (via
// salvarConteudoProduto) + program_detail OU accommodation_detail (upsert),
// conforme o kind. Espelha price-admin-service. Posse por tenant.
import type { SupabaseClient } from "@supabase/supabase-js";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";
import { salvarConteudoProduto } from "@/lib/produto-conteudo-admin-service";
import {
  validarProgramDetail,
  validarAccommodationDetail,
  validarDisponibilidadeProduto,
  type ProgramDetailNormalizado,
  type AccommodationDetailNormalizado,
  type DisponibilidadeNormalizada,
} from "@/lib/produto-conteudo";
import { validarElegibilidade } from "@/lib/elegibilidade";
import { salvarElegibilidade, ElegibilidadeAdminErro } from "@/lib/elegibilidade-admin-service";

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

// Update parcial de `product` (só os 4 campos de duração/disponibilidade — nunca
// status/visibility/name/kind/campus_id, que o fornecedor não pode tocar por
// este caminho). undefined em cada campo mantém o valor atual (patch, não
// substituição total) — mas aqui gravamos sempre os 4 juntos porque
// DisponibilidadeNormalizada já normaliza ausência para null explícito.
function linhaDisponibilidadeProduto(dp: DisponibilidadeNormalizada) {
  return {
    min_duration: dp.min_duration,
    max_duration: dp.max_duration,
    available_from: dp.available_from,
    available_until: dp.available_until,
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
  justificativaElegibilidade?: string,
): Promise<{ ok: boolean; erro?: string; codigo?: "justificativa_elegibilidade_obrigatoria" }> {
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

  // Bloco de duração/disponibilidade (min_duration/max_duration/available_from/
  // available_until — colunas de `product`). Ausente em submissions antigas
  // (criadas antes deste bloco existir): nesse caso não mexe em `product`.
  const disponibilidadeRaw = (payload as { disponibilidade?: unknown }).disponibilidade;
  const dv = disponibilidadeRaw !== undefined ? validarDisponibilidadeProduto(disponibilidadeRaw) : null;
  if (dv && !dv.ok) return { ok: false, erro: "A duração/disponibilidade está inválida. Peça um novo envio à escola." };

  // Regras de ELEGIBILIDADE propostas (eligibility_rule) — só para curso.
  // Ausente em submissions antigas/sem proposta: nesse caso não mexe nas
  // regras já cadastradas (ver comentário no tipo ConteudoPayload).
  const elegibilidadeRaw = (payload as { elegibilidade?: unknown }).elegibilidade;
  const ev = det.kind === "program" && elegibilidadeRaw !== undefined
    ? validarElegibilidade({ product_id: det.productId, regras: elegibilidadeRaw })
    : null;
  if (ev && !ev.ok) return { ok: false, erro: "As regras de elegibilidade estão inválidas. Peça um novo envio à escola." };

  // Materializa a elegibilidade proposta ANTES de qualquer outra escrita: se a
  // proposta remove uma regra bloqueante sem justificativa, `salvarElegibilidade`
  // recusa (ElegibilidadeAdminErro) — feito primeiro pra aprovação nunca deixar
  // conteúdo/mídia/ficha/duração já publicados quando essa barreira travar.
  if (ev && ev.ok) {
    try {
      await salvarElegibilidade(supabase, {
        tenantId,
        actor: adminUser,
        ip: ip ?? null,
        productId: det.productId,
        regras: ev.valor.regras,
        justificativa: justificativaElegibilidade,
      });
    } catch (e) {
      if (e instanceof ElegibilidadeAdminErro && e.codigo === "justificativa_obrigatoria") {
        return {
          ok: false,
          erro: "Esta proposta remove uma regra de elegibilidade bloqueante — informe uma justificativa para aprovar.",
          codigo: "justificativa_elegibilidade_obrigatoria",
        };
      }
      console.error("[content-admin] materializar elegibilidade falhou:", e instanceof Error ? e.message : e);
      return { ok: false, erro: "Falha ao materializar as regras de elegibilidade." };
    }
  }

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

  // Materializa a duração/disponibilidade em `product` (só os 4 campos — ver
  // linhaDisponibilidadeProduto). Feito no mesmo passo que o resto do conteúdo,
  // antes da promoção de status/visibility abaixo, que também escreve em product.
  if (dv && dv.ok) {
    const { error } = await supabase.from("product").update(linhaDisponibilidadeProduto(dv.valor)).eq("id", det.productId);
    if (error) {
      console.error("[content-admin] atualizar disponibilidade do produto falhou:", error.message);
      return { ok: false, erro: "Falha ao materializar a duração/disponibilidade." };
    }
  }

  // 1a aprovação de um produto criado self-service pelo fornecedor (nasceu
  // status=draft/visibility=hidden — ver OpcoesCriacaoProduto em
  // catalog-disponibilidade.ts): promove pra active/internal (ainda NAO
  // quotable/sellable — isso é outra decisão do admin, ex.: publicar preço).
  // Produto que já estava active (cadastrado pelo admin ou fluxo anterior) não
  // é tocado. Guarda por status/visibility atuais (idempotente).
  const { data: produtoAtual } = await supabase
    .from("product")
    .select("status, visibility")
    .eq("id", det.productId)
    .maybeSingle();
  if ((produtoAtual as { status?: string } | null)?.status === "draft" && (produtoAtual as { visibility?: string } | null)?.visibility === "hidden") {
    const { error: ePromo } = await supabase
      .from("product")
      .update({ status: "active", visibility: "internal" })
      .eq("id", det.productId)
      .eq("status", "draft")
      .eq("visibility", "hidden");
    if (ePromo) {
      console.error("[content-admin] promover produto pos-aprovacao falhou:", ePromo.message);
      return { ok: false, erro: "Conteúdo materializado, mas falha ao publicar o produto." };
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
