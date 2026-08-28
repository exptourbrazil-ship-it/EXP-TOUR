// Serviço da conferência automática de fatura (doc 05). SERVER-ONLY (service
// role). A escola sobe DUAS faturas por caso: gross (invoice_escola) e net
// (invoice_escola_net). O serviço baixa cada PDF, extrai por IA, confere o PAR
// contra a previsão e PERSISTE o veredito em fatura_conferencia (upsert por
// contrato). A comissão sai de gross - net; o NET é o valor a remeter. NÃO move
// dinheiro — só classifica a fila de contas a pagar. Posse por tenant.
import type { SupabaseClient } from "@supabase/supabase-js";
import { obterCasoParaRepasse } from "@/lib/payout-admin-service";
import { extrairFaturaPdf } from "@/lib/fatura-extract";
import { conferirFaturas, type Divergencia, type LadoFatura } from "@/lib/fatura-conferencia";

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
  valorGross: number | null;
  valorNet: number | null; // = valor a remeter
  commission: number | null; // gross - net
  currency: string | null;
  divergencias: Divergencia[];
  extractStatus: string | null;
  conferidoEm: string | null;
};

function mapRow(r: any): Conferencia {
  return {
    contratoId: r.contrato_id,
    status: r.status,
    valorGross: r.valor_gross != null ? Number(r.valor_gross) : null,
    valorNet: r.valor_net != null ? Number(r.valor_net) : null,
    commission: r.commission != null ? Number(r.commission) : null,
    currency: r.currency ?? null,
    divergencias: Array.isArray(r.divergencias) ? (r.divergencias as Divergencia[]) : [],
    extractStatus: r.extract_status ?? null,
    conferidoEm: r.conferido_em ?? null,
  };
}

const COLS = "contrato_id, status, valor_gross, valor_net, commission, currency, divergencias, extract_status, conferido_em";

// Veredito persistido de vários contratos (para a fila). Sem extração — só leitura.
export async function mapaConferencias(
  supabase: SupabaseClient,
  tenantId: string,
  contratoIds: string[]
): Promise<Map<string, Conferencia>> {
  const out = new Map<string, Conferencia>();
  if (!contratoIds.length) return out;
  const { data } = await supabase.from("fatura_conferencia").select(COLS).eq("tenant_id", tenantId).in("contrato_id", contratoIds);
  for (const r of (data ?? []) as any[]) out.set(r.contrato_id, mapRow(r));
  return out;
}

// Veredito de UM contrato (para a tela de execução). Null se ainda não conferido.
export async function obterConferencia(
  supabase: SupabaseClient,
  tenantId: string,
  contratoId: string
): Promise<Conferencia | null> {
  const { data } = await supabase
    .from("fatura_conferencia")
    .select(COLS + ", tenant_id")
    .eq("contrato_id", contratoId)
    .maybeSingle();
  if (!data || (data as { tenant_id?: string }).tenant_id !== tenantId) return null;
  return mapRow(data);
}

async function upsert(
  supabase: SupabaseClient,
  tenantId: string,
  contratoId: string,
  patch: {
    documentoId?: string | null;
    documentoNetId?: string | null;
    extracted?: unknown;
    valorGross?: number | null;
    valorNet?: number | null;
    commission?: number | null;
    currency?: string | null;
    status: StatusConferencia;
    divergencias?: Divergencia[];
    extractStatus?: string | null;
  }
): Promise<Conferencia> {
  const agora = new Date().toISOString();
  const row = {
    tenant_id: tenantId,
    contrato_id: contratoId,
    documento_id: patch.documentoId ?? null,
    documento_net_id: patch.documentoNetId ?? null,
    extracted: patch.extracted ?? {},
    valor_gross: patch.valorGross ?? null,
    valor_net: patch.valorNet ?? null,
    commission: patch.commission ?? null,
    // valor_fatura (coluna legada) recebe o NET = valor a remeter.
    valor_fatura: patch.valorNet ?? null,
    currency: patch.currency ?? null,
    status: patch.status,
    divergencias: patch.divergencias ?? [],
    extract_status: patch.extractStatus ?? null,
    conferido_em: agora,
    updated_at: agora,
  };
  await supabase.from("fatura_conferencia").upsert(row, { onConflict: "tenant_id,contrato_id" });
  return mapRow(row);
}

type DocRow = { id: string; origem: string | null; storage_path: string | null };
type LadoExtraido = { status: "ok" | "sem_ia" | "erro" | "sem_pdf" | "pdf_grande" | "download_falhou"; lado: LadoFatura; raw: unknown };

// Baixa o PDF de UM documento e extrai por IA. Nunca lança.
async function extrairLado(supabase: SupabaseClient, doc: DocRow): Promise<LadoExtraido> {
  const bucket = doc.origem ? BUCKET_POR_ORIGEM[doc.origem] : undefined;
  if (!bucket || !doc.storage_path) return { status: "sem_pdf", lado: null, raw: null };
  const { data: blob, error } = await supabase.storage.from(bucket).download(doc.storage_path);
  if (error || !blob) return { status: "download_falhou", lado: null, raw: null };
  if (typeof blob.size === "number" && blob.size > PDF_MAX_BYTES) return { status: "pdf_grande", lado: null, raw: null };
  const base64 = Buffer.from(await blob.arrayBuffer()).toString("base64");
  const ex = await extrairFaturaPdf(base64);
  if (!ex.ok) return { status: ex.status, lado: null, raw: null };
  return {
    status: "ok",
    lado: { amount: ex.dados.grossAmount, currency: ex.dados.currency, studentName: ex.dados.studentName },
    raw: ex.dados,
  };
}

// Fatura mais recente de um tipo para o caso.
async function faturaMaisRecente(supabase: SupabaseClient, contratoId: string, tipo: string): Promise<DocRow | null> {
  const { data } = await supabase
    .from("documentos")
    .select("id, origem, storage_path, created_at")
    .eq("contrato_id", contratoId)
    .eq("tipo_documento", tipo)
    .neq("status", "rejeitado")
    .order("created_at", { ascending: false })
    .limit(1);
  return ((data ?? [])[0] as DocRow) ?? null;
}

// Confere (ou re-confere) o par de faturas de um caso. Idempotente.
export async function conferirFaturaDoContrato(
  supabase: SupabaseClient,
  tenantId: string,
  contratoId: string
): Promise<Conferencia> {
  // Previsão do caso (posse por tenant embutida). Sem caso elegível -> NÃO grava.
  const caso = await obterCasoParaRepasse(supabase, tenantId, contratoId);
  if (!caso) {
    return { contratoId, status: "erro", valorGross: null, valorNet: null, commission: null, currency: null, divergencias: [], extractStatus: "caso_inelegivel", conferidoEm: null };
  }

  const gDoc = await faturaMaisRecente(supabase, contratoId, "invoice_escola");
  const nDoc = await faturaMaisRecente(supabase, contratoId, "invoice_escola_net");
  if (!gDoc && !nDoc) {
    return upsert(supabase, tenantId, contratoId, { status: "sem_fatura", extractStatus: null });
  }

  const gExt = gDoc ? await extrairLado(supabase, gDoc) : null;
  const nExt = nDoc ? await extrairLado(supabase, nDoc) : null;

  // Sem IA configurada -> pendente (nunca veredito falso). Guarda os ids.
  if (gExt?.status === "sem_ia" || nExt?.status === "sem_ia") {
    return upsert(supabase, tenantId, contratoId, {
      documentoId: gDoc?.id ?? null,
      documentoNetId: nDoc?.id ?? null,
      status: "pendente",
      extractStatus: "sem_ia",
    });
  }

  const grossLado = gExt?.status === "ok" ? gExt.lado : null;
  const netLado = nExt?.status === "ok" ? nExt.lado : null;

  const veredito = conferirFaturas({
    gross: grossLado,
    net: netLado,
    previsao: { grossAmount: caso.grossAmount, currency: caso.currency, estudanteNome: caso.estudanteNome },
  });

  // extractStatus: 'ok' só quando as duas faturas existem e extraíram; senão
  // registra o lado ausente/problemático (diagnóstico honesto, não engana a fila).
  const marcas: string[] = [];
  if (!gDoc) marcas.push("gross_ausente");
  else if (gExt && gExt.status !== "ok") marcas.push(`gross_${gExt.status}`);
  if (!nDoc) marcas.push("net_ausente");
  else if (nExt && nExt.status !== "ok") marcas.push(`net_${nExt.status}`);
  const extractStatus = marcas.length === 0 ? "ok" : marcas.join(",");

  const currency = grossLado?.currency ?? netLado?.currency ?? caso.currency ?? null;
  return upsert(supabase, tenantId, contratoId, {
    documentoId: gDoc?.id ?? null,
    documentoNetId: nDoc?.id ?? null,
    extracted: { gross: gExt?.raw ?? null, net: nExt?.raw ?? null },
    valorGross: grossLado?.amount ?? null,
    valorNet: netLado?.amount ?? null,
    commission: veredito.commission,
    currency,
    status: veredito.status,
    divergencias: veredito.divergencias,
    extractStatus,
  });
}

// Casos que o cron deve (re)conferir: sem veredito; com veredito transitório
// (erro/pendente/sem_fatura); OU cuja fatura vigente (gross ou net) mudou desde
// a conferência. Vereditos estáveis da MESMA dupla não são reprocessados.
export async function contratosParaConferir(
  supabase: SupabaseClient,
  tenantId: string,
  contratoIds: string[]
): Promise<string[]> {
  if (!contratoIds.length) return [];

  const { data: rows } = await supabase
    .from("fatura_conferencia")
    .select("contrato_id, status, documento_id, documento_net_id")
    .eq("tenant_id", tenantId)
    .in("contrato_id", contratoIds);
  const porContrato = new Map<string, { status: string; docId: string | null; docNetId: string | null }>();
  for (const r of (rows ?? []) as any[]) porContrato.set(r.contrato_id, { status: r.status, docId: r.documento_id ?? null, docNetId: r.documento_net_id ?? null });

  // Fatura vigente (gross e net) por contrato.
  const { data: docs } = await supabase
    .from("documentos")
    .select("id, contrato_id, tipo_documento, created_at")
    .in("contrato_id", contratoIds)
    .in("tipo_documento", ["invoice_escola", "invoice_escola_net"])
    .neq("status", "rejeitado")
    .order("created_at", { ascending: false });
  const grossVigente = new Map<string, string>();
  const netVigente = new Map<string, string>();
  for (const d of (docs ?? []) as any[]) {
    const m = d.tipo_documento === "invoice_escola_net" ? netVigente : grossVigente;
    if (!m.has(d.contrato_id)) m.set(d.contrato_id, d.id);
  }

  const alvo: string[] = [];
  for (const id of contratoIds) {
    const row = porContrato.get(id);
    if (!row) { alvo.push(id); continue; }
    if (row.status === "erro" || row.status === "pendente" || row.status === "sem_fatura") { alvo.push(id); continue; }
    const g = grossVigente.get(id) ?? null;
    const n = netVigente.get(id) ?? null;
    if ((g && g !== row.docId) || (n && n !== row.docNetId)) alvo.push(id); // alguma fatura trocada
  }
  return alvo;
}
