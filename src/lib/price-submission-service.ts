// Servico do envio de price list (Fase C). SERVER-ONLY (service role). Posse
// sempre pelo supplierId. Nada de preco vivo aqui: guarda o RASCUNHO (jsonb) e
// o fluxo de aprovacao; a materializacao em preco active fica na fatia do Admin.
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizarPriceListExtraido, contarItens, type PriceListExtraido } from "@/lib/price-list-extract";

export type SubmissionStatus = "draft" | "pending_admin" | "approved" | "rejected";

export type SubmissionResumo = {
  id: string;
  status: SubmissionStatus;
  currency: string | null;
  itens: number;
  extractStatus: string | null;
  sourceFilename: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type SubmissionDetalhe = SubmissionResumo & { extracted: PriceListExtraido };

function mapResumo(r: any): SubmissionResumo {
  const extracted = normalizarPriceListExtraido(r.extracted);
  return {
    id: r.id,
    status: r.status,
    currency: r.currency ?? extracted.currency ?? null,
    itens: contarItens(extracted),
    extractStatus: r.extract_status ?? null,
    sourceFilename: r.source_filename ?? null,
    createdAt: r.created_at ?? null,
    updatedAt: r.updated_at ?? null,
  };
}

export async function criarSubmission(
  supabase: SupabaseClient,
  entrada: {
    tenantId: string;
    supplierId: string;
    campusId: string | null;
    sourceStoragePath: string | null;
    sourceFilename: string | null;
    extracted: PriceListExtraido;
    extractStatus: string;
    createdBy: string;
  }
): Promise<{ ok: true; id: string } | { ok: false; erro: string }> {
  const { data, error } = await supabase
    .from("price_submission")
    .insert({
      tenant_id: entrada.tenantId,
      supplier_id: entrada.supplierId,
      campus_id: entrada.campusId,
      source_storage_path: entrada.sourceStoragePath,
      source_filename: entrada.sourceFilename,
      currency: entrada.extracted.currency,
      extracted: entrada.extracted,
      extract_status: entrada.extractStatus,
      created_by: entrada.createdBy,
      status: "draft",
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, erro: "Falha ao registrar o price list." };
  return { ok: true, id: data.id as string };
}

// Submissions do fornecedor (mais recentes primeiro).
export async function listarSubmissionsDoFornecedor(
  supabase: SupabaseClient,
  supplierId: string
): Promise<SubmissionResumo[]> {
  const { data } = await supabase
    .from("price_submission")
    .select("id, status, currency, extracted, extract_status, source_filename, created_at, updated_at")
    .eq("supplier_id", supplierId)
    .order("created_at", { ascending: false });
  return (data ?? []).map(mapResumo);
}

// Um submission do fornecedor (posse reconferida). null se nao for desta escola.
export async function obterSubmissionDoFornecedor(
  supabase: SupabaseClient,
  supplierId: string,
  id: string
): Promise<SubmissionDetalhe | null> {
  const { data } = await supabase
    .from("price_submission")
    .select("id, supplier_id, status, currency, extracted, extract_status, source_filename, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();
  if (!data || (data as { supplier_id?: string }).supplier_id !== supplierId) return null;
  return { ...mapResumo(data), extracted: normalizarPriceListExtraido((data as any).extracted) };
}

// Salva a edicao do rascunho (so enquanto draft). Normaliza antes de gravar.
export async function atualizarExtracted(
  supabase: SupabaseClient,
  supplierId: string,
  id: string,
  extractedRaw: unknown
): Promise<{ ok: boolean; erro?: string }> {
  const atual = await obterSubmissionDoFornecedor(supabase, supplierId, id);
  if (!atual) return { ok: false, erro: "Price list não encontrado." };
  if (atual.status !== "draft") return { ok: false, erro: "Este price list não está mais em rascunho." };

  const extracted = normalizarPriceListExtraido(extractedRaw);
  const { error } = await supabase
    .from("price_submission")
    .update({ extracted, currency: extracted.currency, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "draft");
  if (error) return { ok: false, erro: "Falha ao salvar o rascunho." };
  return { ok: true };
}

// A escola aprova e envia para a EXP Tour (draft -> pending_admin). Exige ao
// menos um item. Guarda contra corrida (so quando ainda draft).
export async function aprovarPelaEscola(
  supabase: SupabaseClient,
  supplierId: string,
  id: string,
  submittedBy: string
): Promise<{ ok: boolean; erro?: string }> {
  const atual = await obterSubmissionDoFornecedor(supabase, supplierId, id);
  if (!atual) return { ok: false, erro: "Price list não encontrado." };
  if (atual.status !== "draft") return { ok: false, erro: "Este price list já foi enviado." };
  if (atual.itens === 0) return { ok: false, erro: "Adicione ao menos um item antes de enviar." };

  const { data, error } = await supabase
    .from("price_submission")
    .update({
      status: "pending_admin",
      submitted_by: submittedBy,
      supplier_approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "draft")
    .select("id");
  if (error) return { ok: false, erro: "Falha ao enviar o price list." };
  if (!data || data.length === 0) return { ok: false, erro: "Este price list já foi enviado." };
  return { ok: true };
}
