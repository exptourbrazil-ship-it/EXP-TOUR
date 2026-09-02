// Servico de ESCRITA de PROMOCOES (promotion + promotion_target) pela Area
// Administrativa. SERVER-ONLY (service role). Promocao e sempre autoral do Admin
// (nao ha source_submission_id / fluxo de escola) — logo, sem fronteira: so
// posse por tenant.
//
// POSSE: tudo escopado pelo tenant. A promocao pendura num fornecedor
// (supplier_id NOT NULL) do tenant; o campus (opcional) tem que ser do tenant E
// do fornecedor; o alvo especifico (applies_to_ref_id) — taxa ou produto — tem
// que ser do tenant.
import type { SupabaseClient } from "@supabase/supabase-js";
import { validarPromocao, type Falha } from "@/lib/promocao";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";

export class PromocaoAdminErro extends Error {
  constructor(
    public codigo:
      | "validacao"
      | "supplier_invalido"
      | "campus_invalido"
      | "ref_invalido"
      | "promocao_nao_encontrada"
      | "falha_persistir",
    public falhas?: Falha[],
  ) {
    super(codigo);
    this.name = "PromocaoAdminErro";
  }
}

async function supplierDoTenant(supabase: SupabaseClient, tenantId: string, supplierId: string): Promise<boolean> {
  const { data } = await supabase.from("supplier").select("id, tenant_id").eq("id", supplierId).maybeSingle();
  return !!data && (data as { tenant_id?: string }).tenant_id === tenantId;
}

// Campus do tenant E do fornecedor da promocao.
async function campusDoTenantESupplier(
  supabase: SupabaseClient,
  tenantId: string,
  supplierId: string,
  campusId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("campus")
    .select("id, tenant_id, supplier_id")
    .eq("id", campusId)
    .maybeSingle();
  return (
    !!data &&
    (data as { tenant_id?: string }).tenant_id === tenantId &&
    (data as { supplier_id?: string }).supplier_id === supplierId
  );
}

// Alvo especifico (taxa ou produto) do tenant.
async function refDoTenant(
  supabase: SupabaseClient,
  tenantId: string,
  appliesTo: string,
  refId: string,
): Promise<boolean> {
  const tabela = appliesTo === "specific_fee" ? "fee" : "product";
  const { data } = await supabase.from(tabela).select("id, tenant_id").eq("id", refId).maybeSingle();
  return !!data && (data as { tenant_id?: string }).tenant_id === tenantId;
}

export type SalvarPromocaoArgs = {
  tenantId: string;
  actor: string;
  ip?: string | null;
  promotionId?: string | null;
  entrada: unknown;
};

export async function salvarPromocao(
  supabase: SupabaseClient,
  args: SalvarPromocaoArgs,
): Promise<{ id: string; criado: boolean }> {
  const { tenantId, actor, ip, promotionId } = args;

  const r = validarPromocao(args.entrada);
  if (!r.ok) throw new PromocaoAdminErro("validacao", r.falhas);
  const { promotion, targets } = r.valor;

  if (!(await supplierDoTenant(supabase, tenantId, promotion.supplier_id))) {
    throw new PromocaoAdminErro("supplier_invalido");
  }
  if (promotion.campus_id && !(await campusDoTenantESupplier(supabase, tenantId, promotion.supplier_id, promotion.campus_id))) {
    throw new PromocaoAdminErro("campus_invalido");
  }
  if (promotion.applies_to_ref_id && !(await refDoTenant(supabase, tenantId, promotion.applies_to, promotion.applies_to_ref_id))) {
    throw new PromocaoAdminErro("ref_invalido");
  }

  const linha = {
    tenant_id: tenantId,
    supplier_id: promotion.supplier_id,
    campus_id: promotion.campus_id,
    name: promotion.name,
    promo_type: promotion.promo_type,
    value: promotion.value,
    free_units_semantics: promotion.free_units_semantics,
    applies_to: promotion.applies_to,
    applies_to_ref_id: promotion.applies_to_ref_id,
    min_quantity: promotion.min_quantity,
    max_discount_amount: promotion.max_discount_amount,
    is_stackable: promotion.is_stackable,
    priority: promotion.priority,
    booking_from: promotion.booking_from,
    booking_until: promotion.booking_until,
    travel_from: promotion.travel_from,
    travel_until: promotion.travel_until,
    status: promotion.status,
  };

  let id: string;
  let criado: boolean;

  if (promotionId) {
    const { data: existente } = await supabase.from("promotion").select("*").eq("id", promotionId).maybeSingle();
    if (!existente || (existente as { tenant_id?: string }).tenant_id !== tenantId) {
      throw new PromocaoAdminErro("promocao_nao_encontrada");
    }
    const snapTargets = await snapshotTargets(supabase, promotionId);

    const { data: upd, error } = await supabase
      .from("promotion")
      .update({ ...linha, updated_at: new Date().toISOString() })
      .eq("id", promotionId)
      .eq("tenant_id", tenantId)
      .select("id");
    if (error) {
      console.error("[promocoes] atualizar:", error.message);
      throw new PromocaoAdminErro("falha_persistir");
    }
    if (!upd || upd.length === 0) throw new PromocaoAdminErro("promocao_nao_encontrada");
    id = promotionId;
    criado = false;

    try {
      await persistirTargets(supabase, id, targets);
    } catch (e) {
      await restaurarPromocao(supabase, existente as Record<string, unknown>, snapTargets);
      throw e;
    }
  } else {
    const { data, error } = await supabase.from("promotion").insert(linha).select("id").single();
    if (error || !data) {
      if (error) console.error("[promocoes] criar:", error.message);
      throw new PromocaoAdminErro("falha_persistir");
    }
    id = (data as { id: string }).id;
    criado = true;

    try {
      await persistirTargets(supabase, id, targets);
    } catch (e) {
      const { error: eComp } = await supabase.from("promotion").delete().eq("id", id).eq("tenant_id", tenantId);
      if (eComp) console.error("[promocoes] compensacao falhou:", eComp.message);
      throw e;
    }
  }

  await registrarAuditoriaAdmin(supabase, {
    usuario: actor,
    acao: criado ? "promocao.criar" : "promocao.editar",
    alvo: id,
    detalhe: { name: promotion.name, promo_type: promotion.promo_type, applies_to: promotion.applies_to, status: promotion.status, segmentos: targets.length },
    ip: ip ?? null,
  });

  return { id, criado };
}

async function snapshotTargets(supabase: SupabaseClient, promotionId: string): Promise<{ dimension: string; value: string }[]> {
  const { data } = await supabase.from("promotion_target").select("dimension, value").eq("promotion_id", promotionId);
  return (data ?? []).map((t: any) => ({ dimension: t.dimension, value: t.value }));
}

async function persistirTargets(
  supabase: SupabaseClient,
  promotionId: string,
  targets: { dimension: string; value: string }[],
): Promise<void> {
  const { error: eDel } = await supabase.from("promotion_target").delete().eq("promotion_id", promotionId);
  if (eDel) {
    console.error("[promocoes] limpar segmentos:", eDel.message);
    throw new PromocaoAdminErro("falha_persistir");
  }
  if (targets.length > 0) {
    const { error: eIns } = await supabase
      .from("promotion_target")
      .insert(targets.map((t) => ({ promotion_id: promotionId, dimension: t.dimension, value: t.value })));
    if (eIns) {
      console.error("[promocoes] inserir segmentos:", eIns.message);
      throw new PromocaoAdminErro("falha_persistir");
    }
  }
}

// Restaura (best-effort) as COLUNAS + segmentos a partir do snapshot. NUNCA lanca.
async function restaurarPromocao(
  supabase: SupabaseClient,
  linhaAnterior: Record<string, unknown>,
  snapTargets: { dimension: string; value: string }[],
): Promise<void> {
  const id = linhaAnterior.id as string;
  try {
    await supabase
      .from("promotion")
      .update({
        supplier_id: linhaAnterior.supplier_id,
        campus_id: linhaAnterior.campus_id,
        name: linhaAnterior.name,
        promo_type: linhaAnterior.promo_type,
        value: linhaAnterior.value,
        free_units_semantics: linhaAnterior.free_units_semantics,
        applies_to: linhaAnterior.applies_to,
        applies_to_ref_id: linhaAnterior.applies_to_ref_id,
        min_quantity: linhaAnterior.min_quantity,
        max_discount_amount: linhaAnterior.max_discount_amount,
        is_stackable: linhaAnterior.is_stackable,
        priority: linhaAnterior.priority,
        booking_from: linhaAnterior.booking_from,
        booking_until: linhaAnterior.booking_until,
        travel_from: linhaAnterior.travel_from,
        travel_until: linhaAnterior.travel_until,
        status: linhaAnterior.status,
        updated_at: linhaAnterior.updated_at ?? null,
      })
      .eq("id", id);
    await supabase.from("promotion_target").delete().eq("promotion_id", id);
    if (snapTargets.length > 0) {
      await supabase.from("promotion_target").insert(snapTargets.map((t) => ({ promotion_id: id, dimension: t.dimension, value: t.value })));
    }
  } catch (err) {
    console.error("[promocoes] restauracao apos falha parcial falhou:", err instanceof Error ? err.message : err);
  }
}

// Arquiva (expira) uma promocao do tenant.
export async function arquivarPromocao(
  supabase: SupabaseClient,
  args: { tenantId: string; actor: string; ip?: string | null; promotionId: string },
): Promise<void> {
  const { tenantId, actor, ip, promotionId } = args;
  const { data: existente } = await supabase.from("promotion").select("id, tenant_id").eq("id", promotionId).maybeSingle();
  if (!existente || (existente as { tenant_id?: string }).tenant_id !== tenantId) {
    throw new PromocaoAdminErro("promocao_nao_encontrada");
  }
  const { data: upd, error } = await supabase
    .from("promotion")
    .update({ status: "expired", archived_at: new Date().toISOString() })
    .eq("id", promotionId)
    .eq("tenant_id", tenantId)
    .select("id");
  if (error) {
    console.error("[promocoes] arquivar:", error.message);
    throw new PromocaoAdminErro("falha_persistir");
  }
  if (!upd || upd.length === 0) throw new PromocaoAdminErro("promocao_nao_encontrada");
  await registrarAuditoriaAdmin(supabase, { usuario: actor, acao: "promocao.arquivar", alvo: promotionId, ip: ip ?? null });
}

// ── Leituras para a UI admin ────────────────────────────────────────────────

export type PromocaoLista = {
  id: string;
  name: string;
  promoType: string;
  appliesTo: string;
  value: number | null;
  status: string;
  supplierName: string | null;
  campusName: string | null;
  segmentos: number;
  isStackable: boolean;
  priority: number;
  updatedAt: string | null;
};

export async function listarPromocoesAdmin(
  supabase: SupabaseClient,
  tenantId: string,
  filtro?: { supplierId?: string },
): Promise<PromocaoLista[]> {
  let q = supabase
    .from("promotion")
    .select(
      "id, name, promo_type, applies_to, value, status, is_stackable, priority, updated_at, supplier:supplier(display_name), campus:campus(name), segmentos:promotion_target(count)",
    )
    .eq("tenant_id", tenantId)
    .is("archived_at", null)
    .order("updated_at", { ascending: false, nullsFirst: false })
    .order("name");
  if (filtro?.supplierId) q = q.eq("supplier_id", filtro.supplierId);
  const { data } = await q;
  return (data ?? []).map((p: any) => {
    const supplier = Array.isArray(p.supplier) ? p.supplier[0] : p.supplier;
    const campus = Array.isArray(p.campus) ? p.campus[0] : p.campus;
    const segmentos = Array.isArray(p.segmentos) ? (p.segmentos[0]?.count ?? 0) : 0;
    return {
      id: p.id,
      name: p.name,
      promoType: p.promo_type,
      appliesTo: p.applies_to,
      value: p.value != null ? Number(p.value) : null,
      status: p.status,
      supplierName: supplier?.display_name ?? null,
      campusName: campus?.name ?? null,
      segmentos,
      isStackable: !!p.is_stackable,
      priority: p.priority,
      updatedAt: p.updated_at ?? null,
    };
  });
}

export async function obterPromocaoAdmin(
  supabase: SupabaseClient,
  tenantId: string,
  promotionId: string,
): Promise<{ promotion: Record<string, unknown>; targets: { dimension: string; value: string }[] } | null> {
  const { data: promo } = await supabase.from("promotion").select("*").eq("id", promotionId).eq("tenant_id", tenantId).maybeSingle();
  if (!promo) return null;
  const { data: targets } = await supabase.from("promotion_target").select("dimension, value").eq("promotion_id", promotionId);
  return { promotion: promo as Record<string, unknown>, targets: (targets ?? []) as { dimension: string; value: string }[] };
}

// Fornecedores do tenant (para o seletor).
export async function listarSuppliersDoTenant(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<{ id: string; name: string }[]> {
  const { data } = await supabase
    .from("supplier")
    .select("id, display_name")
    .eq("tenant_id", tenantId)
    .is("archived_at", null)
    .order("display_name");
  return (data ?? []).map((s: any) => ({ id: s.id, name: s.display_name }));
}
