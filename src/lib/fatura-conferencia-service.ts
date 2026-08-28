// Serviço da conferência automática de fatura (doc 05). SERVER-ONLY (service
// role). Baixa a fatura (invoice_escola) do caso, extrai por IA, confere contra
// a previsão e PERSISTE o veredito em fatura_conferencia (upsert por contrato).
// NÃO move dinheiro — só classifica a fila de contas a pagar. Posse por tenant.
import type { SupabaseClient } from "@supabase/supabase-js";
import { obterCasoParaRepasse } from "@/lib/payout-admin-service";
import { extrairFaturaPdf, normalizarFaturaExtraida, type FaturaExtraida } from "@/lib/fatura-extract";
import { conferirFatura, type Divergencia, type StatusVeredito } from "@/lib/fatura-conferencia";

// Mapa origem -> bucket privado (mesmo do download de documentos).
const BUCKET_POR_ORIGEM: Record<string, string> = {
  titular: "documentos-titular",
  admin: "documentos-admin",
  sistema: "documentos-contratos",
  fornecedor: "documentos-fornecedor",
};

export type StatusConferencia = "pendente" | "conferida" | "divergente" | "indeterminado" | "sem_fatura" | "erro";

// Teto de tamanho do PDF antes de mandar para a IA (custo/robustez).
const PDF_MAX_BYTES = 10 * 1024 * 1024;

export type Conferencia = {
  contratoId: string;
  status: StatusConferencia;
  valorFatura: number | null;
  currency: string | null;
  divergencias: Divergencia[];
  extractStatus: string | null;
  conferidoEm: string | null;
};

function mapRow(r: any): Conferencia {
  return {
    contratoId: r.contrato_id,
    status: r.status,
    valorFatura: r.valor_fatura != null ? Number(r.valor_fatura) : null,
    currency: r.currency ?? null,
    divergencias: Array.isArray(r.divergencias) ? (r.divergencias as Divergencia[]) : [],
    extractStatus: r.extract_status ?? null,
    conferidoEm: r.conferido_em ?? null,
  };
}

// Veredito persistido de vários contratos (para a fila). Sem extração — só leitura.
export async function mapaConferencias(
  supabase: SupabaseClient,
  tenantId: string,
  contratoIds: string[]
): Promise<Map<string, Conferencia>> {
  const out = new Map<string, Conferencia>();
  if (!contratoIds.length) return out;
  const { data } = await supabase
    .from("fatura_conferencia")
    .select("contrato_id, status, valor_fatura, currency, divergencias, extract_status, conferido_em")
    .eq("tenant_id", tenantId)
    .in("contrato_id", contratoIds);
  for (const r of (data ?? []) as any[]) out.set(r.contrato_id, mapRow(r));
  return out;
}

// Veredito de UM contrato (para a tela de execução). Null se ainda não conferido.
export async function obterConferencia(
  supabase: SupabaseClient,
  tenantId: string,
  contratoId: string
): Promise<(Conferencia & { extracted: FaturaExtraida }) | null> {
  const { data } = await supabase
    .from("fatura_conferencia")
    .select("contrato_id, tenant_id, status, valor_fatura, currency, divergencias, extract_status, conferido_em, extracted")
    .eq("contrato_id", contratoId)
    .maybeSingle();
  if (!data || (data as { tenant_id?: string }).tenant_id !== tenantId) return null;
  return { ...mapRow(data), extracted: normalizarFaturaExtraida((data as any).extracted) };
}

async function upsert(
  supabase: SupabaseClient,
  tenantId: string,
  contratoId: string,
  patch: {
    documentoId?: string | null;
    extracted?: unknown;
    valorFatura?: number | null;
    currency?: string | null;
    status: StatusConferencia;
    divergencias?: Divergencia[];
    extractStatus?: string | null;
  }
): Promise<Conferencia> {
  const row = {
    tenant_id: tenantId,
    contrato_id: contratoId,
    documento_id: patch.documentoId ?? null,
    extracted: patch.extracted ?? {},
    valor_fatura: patch.valorFatura ?? null,
    currency: patch.currency ?? null,
    status: patch.status,
    divergencias: patch.divergencias ?? [],
    extract_status: patch.extractStatus ?? null,
    conferido_em: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  await supabase.from("fatura_conferencia").upsert(row, { onConflict: "tenant_id,contrato_id" });
  return mapRow(row);
}

// Confere (ou re-confere) a fatura de um caso. Idempotente: sempre recalcula a
// partir da fatura vigente e sobrescreve o veredito. Retorna o resultado.
export async function conferirFaturaDoContrato(
  supabase: SupabaseClient,
  tenantId: string,
  contratoId: string
): Promise<Conferencia> {
  // Previsão do caso (posse por tenant embutida). Sem caso elegível -> NÃO grava
  // nada (evita plantar linha para contrato de outro tenant / cancelado /
  // inexistente). Só devolve o resultado efêmero.
  const caso = await obterCasoParaRepasse(supabase, tenantId, contratoId);
  if (!caso) {
    return { contratoId, status: "erro", valorFatura: null, currency: null, divergencias: [], extractStatus: "caso_inelegivel", conferidoEm: null };
  }

  // Fatura vigente: o invoice_escola mais recente do caso.
  const { data: docs } = await supabase
    .from("documentos")
    .select("id, origem, storage_path, created_at")
    .eq("contrato_id", contratoId)
    .eq("tipo_documento", "invoice_escola")
    .neq("status", "rejeitado")
    .order("created_at", { ascending: false })
    .limit(1);
  const doc = (docs ?? [])[0] as { id: string; origem: string | null; storage_path: string | null } | undefined;
  if (!doc) {
    return upsert(supabase, tenantId, contratoId, { status: "sem_fatura", extractStatus: null });
  }

  // Baixa o PDF do bucket privado (só origens com storage_path; Zoho fica pendente).
  const bucket = doc.origem ? BUCKET_POR_ORIGEM[doc.origem] : undefined;
  if (!bucket || !doc.storage_path) {
    return upsert(supabase, tenantId, contratoId, { documentoId: doc.id, status: "pendente", extractStatus: "sem_pdf" });
  }
  const { data: blob, error: dlErr } = await supabase.storage.from(bucket).download(doc.storage_path);
  if (dlErr || !blob) {
    return upsert(supabase, tenantId, contratoId, { documentoId: doc.id, status: "erro", extractStatus: "download_falhou" });
  }
  // Teto de tamanho ANTES de mandar para a IA (custo/robustez).
  if (typeof blob.size === "number" && blob.size > PDF_MAX_BYTES) {
    return upsert(supabase, tenantId, contratoId, { documentoId: doc.id, status: "erro", extractStatus: "pdf_grande" });
  }
  const base64 = Buffer.from(await blob.arrayBuffer()).toString("base64");

  const extracao = await extrairFaturaPdf(base64);
  if (!extracao.ok) {
    // sem_ia (sem chave) ou erro: fica pendente para o humano, sem veredito falso.
    return upsert(supabase, tenantId, contratoId, {
      documentoId: doc.id,
      status: extracao.status === "sem_ia" ? "pendente" : "erro",
      extractStatus: extracao.status,
    });
  }

  const veredito = conferirFatura({
    fatura: extracao.dados,
    previsao: { grossAmount: caso.grossAmount, currency: caso.currency, estudanteNome: caso.estudanteNome },
  });
  const status: StatusVeredito = veredito.status;
  return upsert(supabase, tenantId, contratoId, {
    documentoId: doc.id,
    extracted: extracao.dados,
    valorFatura: extracao.dados.grossAmount,
    currency: extracao.dados.currency,
    status,
    divergencias: veredito.divergencias,
    extractStatus: "ok",
  });
}

// Casos que o cron deve (re)conferir: sem veredito; com veredito transitório
// (erro/pendente/sem_fatura); OU cuja fatura vigente mudou desde a conferência
// (a escola corrigiu/subiu outra). Vereditos estáveis (conferida/divergente/
// indeterminado) da MESMA fatura não são reprocessados (não gasta IA à toa).
export async function contratosParaConferir(
  supabase: SupabaseClient,
  tenantId: string,
  contratoIds: string[]
): Promise<string[]> {
  if (!contratoIds.length) return [];

  const { data: rows } = await supabase
    .from("fatura_conferencia")
    .select("contrato_id, status, documento_id")
    .eq("tenant_id", tenantId)
    .in("contrato_id", contratoIds);
  const porContrato = new Map<string, { status: string; documentoId: string | null }>();
  for (const r of (rows ?? []) as any[]) porContrato.set(r.contrato_id, { status: r.status, documentoId: r.documento_id ?? null });

  // Fatura vigente (mais recente) por contrato.
  const { data: docs } = await supabase
    .from("documentos")
    .select("id, contrato_id, created_at")
    .in("contrato_id", contratoIds)
    .eq("tipo_documento", "invoice_escola")
    .neq("status", "rejeitado")
    .order("created_at", { ascending: false });
  const faturaVigente = new Map<string, string>();
  for (const d of (docs ?? []) as any[]) if (!faturaVigente.has(d.contrato_id)) faturaVigente.set(d.contrato_id, d.id);

  const alvo: string[] = [];
  for (const id of contratoIds) {
    const row = porContrato.get(id);
    if (!row) { alvo.push(id); continue; } // nunca conferido
    if (row.status === "erro" || row.status === "pendente" || row.status === "sem_fatura") { alvo.push(id); continue; }
    const vigente = faturaVigente.get(id) ?? null;
    if (vigente && vigente !== row.documentoId) alvo.push(id); // fatura trocada
  }
  return alvo;
}
