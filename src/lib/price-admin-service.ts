// Aprovacao/rejeicao do price list pelo Admin (Fase C, fatia 2). SERVER-ONLY.
// A aprovacao MATERIALIZA o rascunho em catalogo (product/price_template/tier/
// fee, status active) e supersede o price list anterior da mesma escola.
//
// ATENCAO (dinheiro): a materializacao roda em varios inserts (o cliente do
// Supabase nao expoe transacao multi-statement). E IDEMPOTENTE: cada tentativa
// primeiro APAGA o que este submission ja materializou (limpa retry parcial) e
// so marca o submission como 'approved' no fim. Um endurecimento futuro e mover
// isto para uma funcao plpgsql (RPC) transacional.
import type { SupabaseClient } from "@supabase/supabase-js";
import { planoDeMaterializacao, resumoDoPlano } from "@/lib/price-materialize";
import { normalizarPriceListExtraido } from "@/lib/price-list-extract";

export type SubmissionAdmin = {
  id: string;
  supplierId: string;
  supplierNome: string | null;
  status: string;
  currency: string | null;
  itens: number;
  sourceFilename: string | null;
  submittedBy: string | null;
  createdAt: string | null;
};

function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

// Fila do admin: submissions aguardando aprovacao (pending_admin).
export async function listarPendentesAdmin(supabase: SupabaseClient, tenantId: string): Promise<SubmissionAdmin[]> {
  const { data } = await supabase
    .from("price_submission")
    .select("id, supplier_id, status, currency, extracted, source_filename, submitted_by, created_at, supplier:supplier(display_name)")
    .eq("tenant_id", tenantId)
    .eq("status", "pending_admin")
    .order("supplier_approved_at", { ascending: true });
  return (data ?? []).map((r: any) => {
    const ext = normalizarPriceListExtraido(r.extracted);
    const sup = Array.isArray(r.supplier) ? r.supplier[0] : r.supplier;
    return {
      id: r.id,
      supplierId: r.supplier_id,
      supplierNome: sup?.display_name ?? null,
      status: r.status,
      currency: r.currency ?? ext.currency ?? null,
      itens: ext.programs.length + ext.accommodations.length + ext.fees.length,
      sourceFilename: r.source_filename ?? null,
      submittedBy: r.submitted_by ?? null,
      createdAt: r.created_at ?? null,
    };
  });
}

import type { PriceListExtraido } from "@/lib/price-list-extract";

// Detalhe de um submission para o admin (rascunho normalizado + nome da escola).
export async function obterDetalheAdmin(
  supabase: SupabaseClient,
  tenantId: string,
  id: string
): Promise<(SubmissionAdmin & { extracted: PriceListExtraido }) | null> {
  const { data } = await supabase
    .from("price_submission")
    .select("id, tenant_id, supplier_id, status, currency, extracted, source_filename, submitted_by, created_at, supplier:supplier(display_name)")
    .eq("id", id)
    .maybeSingle();
  if (!data || (data as { tenant_id?: string }).tenant_id !== tenantId) return null;
  const r = data as any;
  const ext = normalizarPriceListExtraido(r.extracted);
  const sup = Array.isArray(r.supplier) ? r.supplier[0] : r.supplier;
  return {
    id: r.id,
    supplierId: r.supplier_id,
    supplierNome: sup?.display_name ?? null,
    status: r.status,
    currency: r.currency ?? ext.currency ?? null,
    itens: ext.programs.length + ext.accommodations.length + ext.fees.length,
    sourceFilename: r.source_filename ?? null,
    submittedBy: r.submitted_by ?? null,
    createdAt: r.created_at ?? null,
    extracted: ext,
  };
}

type SubmissionRow = {
  id: string;
  tenant_id: string;
  supplier_id: string;
  campus_id: string | null;
  currency: string | null;
  extracted: unknown;
  status: string;
  submitted_by: string | null;
};

async function carregar(supabase: SupabaseClient, tenantId: string, id: string): Promise<SubmissionRow | null> {
  const { data } = await supabase
    .from("price_submission")
    .select("id, tenant_id, supplier_id, campus_id, currency, extracted, status, submitted_by")
    .eq("id", id)
    .maybeSingle();
  if (!data || (data as SubmissionRow).tenant_id !== tenantId) return null;
  return data as SubmissionRow;
}

// Apaga o que ESTE submission ja materializou (idempotencia de retry). Deletar o
// price_template cascateia tiers e o vinculo; deletar o product cascateia o
// detail. As taxas sao deletadas a parte.
async function limparMaterializacaoDoSubmission(supabase: SupabaseClient, submissionId: string) {
  await supabase.from("fee").delete().eq("source_submission_id", submissionId);
  await supabase.from("price_template").delete().eq("source_submission_id", submissionId);
  await supabase.from("product").delete().eq("source_submission_id", submissionId);
}

// Expira (soft) a materializacao de submissions APROVADOS ANTERIORES da mesma
// escola — o novo price list supersede o anterior. Nao toca no que o admin criou
// a mao (source_submission_id NULL).
async function supersedeAnteriores(supabase: SupabaseClient, sub: SubmissionRow) {
  // So o MESMO campus (multi-campus: publicar a lista de um campus nao pode
  // expirar o preco vivo de outro). Filtro de tenant por consistencia.
  const { data: priors } = await supabase
    .from("price_submission")
    .select("id")
    .eq("tenant_id", sub.tenant_id)
    .eq("supplier_id", sub.supplier_id)
    .eq("campus_id", sub.campus_id as string)
    .eq("status", "approved")
    .neq("id", sub.id);
  const ids = (priors ?? []).map((p) => (p as { id: string }).id);
  if (ids.length === 0) return;
  const agora = new Date().toISOString();
  await supabase.from("price_template").update({ status: "expired" }).in("source_submission_id", ids);
  await supabase.from("product").update({ archived_at: agora }).in("source_submission_id", ids);
  await supabase.from("fee").update({ archived_at: agora }).in("source_submission_id", ids);
}

// Materializa o rascunho aprovado em catalogo. Retorna o resumo do que entrou.
async function materializar(
  supabase: SupabaseClient,
  sub: SubmissionRow
): Promise<{ ok: true; resumo: { produtos: number; taxas: number; faixas: number } } | { ok: false; erro: string }> {
  const currency = (sub.currency || normalizarPriceListExtraido(sub.extracted).currency || "").toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    return { ok: false, erro: "Defina a moeda (3 letras) do price list antes de aprovar." };
  }
  if (!sub.campus_id) return { ok: false, erro: "Fornecedor sem campus — não é possível publicar." };

  const plano = planoDeMaterializacao(normalizarPriceListExtraido(sub.extracted), currency);
  const resumo = resumoDoPlano(plano);
  if (resumo.produtos === 0 && resumo.taxas === 0) {
    return { ok: false, erro: "Nada a publicar (rascunho vazio)." };
  }

  // Idempotencia: limpa uma materializacao parcial anterior deste submission.
  await limparMaterializacaoDoSubmission(supabase, sub.id);

  const dataInicio = hoje();
  for (const pr of plano.produtos) {
    const { data: prod, error: eProd } = await supabase
      .from("product")
      .insert({
        tenant_id: sub.tenant_id,
        campus_id: sub.campus_id,
        kind: pr.kind,
        name: pr.name,
        source: "supplier",
        visibility: "quotable",
        status: "active",
        default_unit: pr.unit,
        source_submission_id: sub.id,
      })
      .select("id")
      .single();
    if (eProd || !prod) return { ok: false, erro: `Falha ao publicar produto "${pr.name}".` };

    const detailTable = pr.kind === "program" ? "program_detail" : "accommodation_detail";
    const { error: eDet } = await supabase.from(detailTable).upsert({ product_id: prod.id, ...pr.detail }, { onConflict: "product_id" });
    if (eDet) return { ok: false, erro: `Falha ao publicar o detalhe de "${pr.name}".` };

    const { data: tpl, error: eTpl } = await supabase
      .from("price_template")
      .insert({
        tenant_id: sub.tenant_id,
        campus_id: sub.campus_id,
        name: pr.template.name,
        price_basis: pr.template.price_basis,
        duration_type: pr.template.duration_type,
        unit: pr.template.unit,
        currency,
        charge_in_tiers: pr.template.charge_in_tiers,
        valid_from: dataInicio,
        status: "active",
        source_submission_id: sub.id,
      })
      .select("id")
      .single();
    if (eTpl || !tpl) return { ok: false, erro: `Falha ao publicar o preço de "${pr.name}".` };

    if (pr.tiers.length > 0) {
      const { error: eTier } = await supabase
        .from("price_tier")
        .insert(pr.tiers.map((t) => ({ price_template_id: tpl.id, min_quantity: t.min_quantity, unit_price: t.unit_price, sort: t.sort })));
      if (eTier) return { ok: false, erro: `Falha ao publicar as faixas de "${pr.name}".` };
    }
    await supabase.from("price_template_product").insert({ price_template_id: tpl.id, product_id: prod.id });
  }

  for (const tx of plano.taxas) {
    const { error: eFee } = await supabase.from("fee").insert({
      tenant_id: sub.tenant_id,
      campus_id: sub.campus_id,
      name: tx.name,
      fee_type: tx.fee_type,
      charge_basis: tx.charge_basis,
      amount: tx.amount,
      currency,
      is_mandatory: tx.is_mandatory,
      source_submission_id: sub.id,
    });
    if (eFee) return { ok: false, erro: `Falha ao publicar a taxa "${tx.name}".` };
  }

  // Supersede fica FORA daqui: so depois que o status vira 'approved', para nao
  // expirar o preco anterior se a finalizacao falhar (a escola nunca fica sem
  // preco vivo).
  return { ok: true, resumo };
}

// Aprova e publica (materializa). So a partir de pending_admin. Idempotente.
export async function aprovarPeloAdmin(
  supabase: SupabaseClient,
  tenantId: string,
  id: string,
  adminUser: string
): Promise<{ ok: true; resumo: { produtos: number; taxas: number; faixas: number }; supplierId: string; submittedBy: string | null } | { ok: false; erro: string }> {
  const sub = await carregar(supabase, tenantId, id);
  if (!sub) return { ok: false, erro: "Price list não encontrado." };
  if (sub.status !== "pending_admin") return { ok: false, erro: "Este price list não está aguardando aprovação." };

  // TRAVA atomica: pending_admin -> processing. So um aprovador vence; os demais
  // (outra aba, dois admins, retry em voo) veem 0 linhas e abortam. Evita a
  // materializacao concorrente duplicar preco.
  const { data: claim } = await supabase
    .from("price_submission")
    .update({ status: "processing", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "pending_admin")
    .select("id");
  if (!claim || claim.length === 0) {
    return { ok: false, erro: "Este price list já está sendo processado." };
  }

  async function reverter() {
    // Limpa o que este submission tenha inserido e devolve para pending_admin,
    // sem tocar nos priors (que so sao expirados APOS a aprovacao concluir).
    await limparMaterializacaoDoSubmission(supabase, id);
    await supabase.from("price_submission").update({ status: "pending_admin", updated_at: new Date().toISOString() }).eq("id", id).eq("status", "processing");
  }

  const mat = await materializar(supabase, { ...sub, status: "processing" });
  if (!mat.ok) {
    await reverter();
    return { ok: false, erro: mat.erro };
  }

  const { data, error } = await supabase
    .from("price_submission")
    .update({ status: "approved", admin_approved_by: adminUser, admin_approved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "processing")
    .select("id");
  if (error || !data || data.length === 0) {
    await reverter();
    return { ok: false, erro: "Falha ao concluir a aprovação (tente novamente)." };
  }

  // So agora (ja 'approved') o novo price list supersede o anterior da escola.
  await supersedeAnteriores(supabase, sub);
  return { ok: true, resumo: mat.resumo, supplierId: sub.supplier_id, submittedBy: sub.submitted_by };
}

// Rejeita (pede ajuste). So a partir de pending_admin.
export async function rejeitarPeloAdmin(
  supabase: SupabaseClient,
  tenantId: string,
  id: string,
  adminUser: string,
  motivo: string
): Promise<{ ok: true; supplierId: string; submittedBy: string | null } | { ok: false; erro: string }> {
  const sub = await carregar(supabase, tenantId, id);
  if (!sub) return { ok: false, erro: "Price list não encontrado." };
  if (sub.status !== "pending_admin") return { ok: false, erro: "Este price list não está aguardando aprovação." };

  const { data, error } = await supabase
    .from("price_submission")
    .update({ status: "rejected", rejected_by: adminUser, rejected_at: new Date().toISOString(), reject_reason: motivo.slice(0, 1000) || null, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "pending_admin")
    .select("id");
  if (error || !data || data.length === 0) return { ok: false, erro: "Falha ao rejeitar." };
  return { ok: true, supplierId: sub.supplier_id, submittedBy: sub.submitted_by };
}
