// Servico do envio de price list (Fase C). SERVER-ONLY (service role). Posse
// sempre pelo supplierId. Nada de preco vivo aqui: guarda o RASCUNHO (jsonb) e
// o fluxo de aprovacao; a materializacao em preco active fica na fatia do Admin.
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizarPriceListExtraido, contarItens, type PriceListExtraido } from "@/lib/price-list-extract";
import { produtoDoFornecedor } from "@/lib/content-submission-service";

// Rascunho vazio (mesma forma normalizada) para a criacao manual — sem PDF,
// sem IA. A escola preenche do zero no mesmo PriceListEditor.
function priceListVazio(): PriceListExtraido {
  return normalizarPriceListExtraido({});
}

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
    // F3.1 (leitura de material por IA): nasce direto na fila do admin e aponta o
    // material de origem. Ausentes = fluxo do portal (rascunho da escola).
    status?: "draft" | "pending_admin";
    sourceMaterialId?: string | null;
    submittedBy?: string | null;
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
      status: entrada.status ?? "draft",
      source_material_id: entrada.sourceMaterialId ?? null,
      submitted_by: entrada.submittedBy ?? null,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, erro: "Falha ao registrar o price list." };
  return { ok: true, id: data.id as string };
}

// Irma de criarSubmission: cria um rascunho VAZIO, sem PDF/IA — a escola monta a
// tabela de preco do zero no mesmo editor (PriceListEditor). Mesma linha no
// banco, so difere a origem dos dados (nenhum arquivo, extract_status="manual").
//
// `prefill` (opcional): usado pelo atalho "+ Propor preço para este curso" de
// dentro do editor de um curso/acomodação já existente — em vez da escola
// digitar tudo de novo, o rascunho já nasce com UM item apontando para aquele
// productId (nome/tipo/unidade herdados do catálogo). O restante do fluxo
// (revisar, adicionar faixas, aprovar) é o mesmo de sempre.
export async function criarSubmissionManual(
  supabase: SupabaseClient,
  entrada: {
    tenantId: string;
    supplierId: string;
    campusId: string | null;
    createdBy: string;
    prefill?: { productId: string; kind: "program" | "accommodation"; name: string; unit?: string; educationType?: string | null; type?: string | null };
  }
): Promise<{ ok: true; id: string } | { ok: false; erro: string }> {
  const extracted = priceListVazio();
  if (entrada.prefill) {
    const { productId, kind, name, unit, educationType, type } = entrada.prefill;
    if (kind === "accommodation") {
      extracted.accommodations.push({ name, type: type ?? null, unit: unit || "week", tiers: [], productId });
    } else {
      extracted.programs.push({ name, educationType: educationType ?? null, unit: unit || "week", tiers: [], productId });
    }
  }
  return criarSubmission(supabase, {
    tenantId: entrada.tenantId,
    supplierId: entrada.supplierId,
    campusId: entrada.campusId,
    sourceStoragePath: null,
    sourceFilename: null,
    extracted,
    extractStatus: "manual",
    createdBy: entrada.createdBy,
  });
}

// Preço VIGENTE (só leitura) de um produto do catálogo, para exibir dentro do
// editor de um curso/acomodação da escola. Reaproveita a mesma leitura do
// admin (produto-admin-service.listarVinculosDoProduto — vínculo por
// price_template_product/fee_product) — a posse (produto é deste supplier) é
// conferida ANTES pelo chamador (rota da API), esta função só busca por
// productId+tenantId.
export async function obterPrecoVigenteDoProduto(
  supabase: SupabaseClient,
  tenantId: string,
  productId: string
): Promise<{ precos: import("@/lib/produto-admin-service").PrecoVinculado[]; taxas: import("@/lib/produto-admin-service").TaxaVinculada[] }> {
  const { listarVinculosDoProduto } = await import("@/lib/produto-admin-service");
  const { precos, taxas } = await listarVinculosDoProduto(supabase, tenantId, productId);
  // "Vigente" para a escola = só o que está active (rascunho/expirada não
  // interessa nesta leitura resumida; o detalhe completo continua na tela de
  // Tabelas por carga horária).
  return { precos: precos.filter((p) => p.status === "active"), taxas };
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

// Reconfere posse de todo `productId` embutido no rascunho antes de gravar —
// defesa em profundidade: a garantia REAL contra vincular preco ao produto de
// OUTRO fornecedor esta no re-check por campus_id em price-admin-service.ts
// (materializar), que nao confia no productId do jsonb. Mas o rascunho em si
// (gravado aqui, so enquanto draft) tambem nao deve reter um productId que o
// fornecedor nao possui — um UUID adulterado (de outra escola) e limpo (vira
// null) em vez de travar o salvamento inteiro.
async function limparProductIdsNaoPossuidos(supabase: SupabaseClient, supplierId: string, extracted: PriceListExtraido): Promise<PriceListExtraido> {
  const checar = async <T extends { productId?: string | null }>(itens: T[], kind: "program" | "accommodation"): Promise<T[]> =>
    Promise.all(
      itens.map(async (item) => {
        if (!item.productId) return item;
        const ok = await produtoDoFornecedor(supabase, supplierId, item.productId, kind);
        return ok ? item : { ...item, productId: null };
      })
    );
  return {
    ...extracted,
    programs: await checar(extracted.programs, "program"),
    accommodations: await checar(extracted.accommodations, "accommodation"),
  };
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

  const extracted = await limparProductIdsNaoPossuidos(supabase, supplierId, normalizarPriceListExtraido(extractedRaw));
  const { error } = await supabase
    .from("price_submission")
    .update({ extracted, currency: extracted.currency, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("supplier_id", supplierId) // defesa em profundidade (posse na propria mutacao)
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
    .eq("supplier_id", supplierId) // defesa em profundidade (posse na propria mutacao)
    .eq("status", "draft")
    .select("id");
  if (error) return { ok: false, erro: "Falha ao enviar o price list." };
  if (!data || data.length === 0) return { ok: false, erro: "Este price list já foi enviado." };
  return { ok: true };
}
