// LEITURA DE MATERIAL POR IA (F3.1) — parte impura. SERVER-ONLY (service role):
// rotas (cron / admin) criam o cliente e o passam. Fluxo: claim atomico do material
// -> baixa o PDF do Storage -> reusa extrairPriceListPdf (o mesmo que ja roda no
// price list do portal) -> cria uma price_submission PENDENTE vinculada ao material
// -> marca o material como 'lida'. "A IA le, o humano publica": nada aqui
// materializa preco; a fila de aprovacao existente e quem publica. NUNCA lanca.
//
// Robustez (achados da revisao): toda transicao de leitura_status e CAS (compare-
// and-set) para nao derrubar o claim de outro leitor; claim OBSOLETO (processo
// morreu) e retomado apos LEITURA_CLAIM_OBSOLETO_MIN; falha transitoria devolve o
// material a fila ate LEITURA_MAX_TENTATIVAS; 'sem_ia' NAO tira da fila; a
// extracao tem timeout; PDF sem moeda identificavel nao gera proposta (seria um
// beco sem saida na publicacao); "ler de novo" substitui (rejeita) a proposta
// aberta anterior do mesmo material, em vez de acumular duas.
import type { SupabaseClient } from "@supabase/supabase-js";
import { extrairPriceListPdf, contarItens, type ResultadoExtracao } from "@/lib/price-list-extract";
import { criarSubmission } from "@/lib/price-submission-service";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";
import { podeLer, resolverCampusParaLeitura, type StatusLeitura } from "@/lib/material-leitura";

const BUCKET = "documentos-fornecedor";
const PDF_MAX_BYTES = Number(process.env.PDF_MAX_BYTES || String(10 * 1024 * 1024));
const CLAIM_OBSOLETO_MIN = Number(process.env.LEITURA_CLAIM_OBSOLETO_MIN || "15");
const MAX_TENTATIVAS = Number(process.env.LEITURA_MAX_TENTATIVAS || "3");
const TIMEOUT_MS = Number(process.env.LEITURA_TIMEOUT_MS || "50000");

export type ResultadoLeitura = {
  materialId: string;
  status: StatusLeitura | "ja_lida" | "nao_encontrado" | "em_leitura" | "nao_legivel";
  submissionId: string | null;
  itens: number;
  erro: string | null;
};

type MaterialRow = {
  id: string;
  supplier_id: string;
  tipo: string;
  mime: string | null;
  link_url: string | null;
  storage_path: string | null;
  nome_arquivo: string | null;
  status: string;
  archived_at: string | null;
  leitura_status: string;
  leitura_em: string | null;
  leitura_tentativas: number | null;
};

function limiteClaimISO(): string {
  return new Date(Date.now() - CLAIM_OBSOLETO_MIN * 60_000).toISOString();
}

// Ids dos materiais na fila do tenant, mais antigos primeiro: 'pendente' OU 'lendo'
// com claim obsoleto (leitura interrompida). So material ja APROVADO pelo admin (F2):
// o arquivo passou pelo crivo humano antes de gastar IA; o botao manual continua
// disponivel para pendentes. O cron processa ate `limite` por execucao.
export async function materiaisParaLer(supabase: SupabaseClient, tenantId: string, limite: number): Promise<string[]> {
  const { data } = await supabase
    .from("material")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("status", "aprovado")
    .is("archived_at", null)
    .or(`leitura_status.eq.pendente,and(leitura_status.eq.lendo,leitura_em.lt.${limiteClaimISO()})`)
    .order("created_at", { ascending: true })
    .limit(limite);
  return (data ?? []).map((r: { id: string }) => r.id);
}

// Propostas (price_submission) geradas a partir de materiais deste fornecedor, para
// o hub linkar "Revisar proposta". Escopo tenant + supplier. Mais recente por material.
export async function propostasPorMaterial(
  supabase: SupabaseClient,
  tenantId: string,
  supplierId: string,
): Promise<Record<string, { id: string; status: string }>> {
  const { data } = await supabase
    .from("price_submission")
    .select("id, status, source_material_id, created_at")
    .eq("tenant_id", tenantId)
    .eq("supplier_id", supplierId)
    .not("source_material_id", "is", null)
    .order("created_at", { ascending: false });
  const out: Record<string, { id: string; status: string }> = {};
  for (const r of (data ?? []) as Array<{ id: string; status: string; source_material_id: string }>) {
    if (!out[r.source_material_id]) out[r.source_material_id] = { id: r.id, status: r.status };
  }
  return out;
}

// Transicao de leitura_status com CAS: so grava se o status atual for `esperado`
// (nao pisa no claim de outro leitor). `tentativas` opcional atualiza o contador.
async function marcar(
  supabase: SupabaseClient,
  tenantId: string,
  materialId: string,
  status: StatusLeitura,
  erro: string | null,
  esperado: string,
  tentativas?: number,
): Promise<void> {
  const patch: Record<string, unknown> = { leitura_status: status, leitura_em: new Date().toISOString(), leitura_erro: erro };
  if (tentativas !== undefined) patch.leitura_tentativas = tentativas;
  await supabase.from("material").update(patch).eq("id", materialId).eq("tenant_id", tenantId).eq("leitura_status", esperado);
}

// Extracao com timeout: a funcao serverless tem teto de execucao; sem isso um
// pendurao da API deixaria o claim 'lendo' ate ficar obsoleto.
async function extrairComTimeout(base64: string): Promise<ResultadoExtracao> {
  const timeout = new Promise<ResultadoExtracao>((resolve) =>
    setTimeout(() => resolve({ ok: false, status: "erro" } as unknown as ResultadoExtracao), TIMEOUT_MS),
  );
  return Promise.race([extrairPriceListPdf(base64), timeout]);
}

// Le UM material. `campusId` = escolha do admin (obrigatoria quando o fornecedor tem
// 0/2+ campi ativos); `forcar` = reler um material ja processado (a proposta aberta
// anterior e REJEITADA como "substituida", nao acumula). Idempotente por padrao: se
// ja existe proposta aberta deste material, devolve-a sem gastar IA.
export async function lerMaterial(
  supabase: SupabaseClient,
  args: { tenantId: string; materialId: string; actor: string; ip?: string | null; campusId?: string | null; forcar?: boolean },
): Promise<ResultadoLeitura> {
  const { tenantId, materialId, actor } = args;
  const base = { materialId, submissionId: null as string | null, itens: 0, erro: null as string | null };

  const { data: m } = await supabase
    .from("material")
    .select("id, supplier_id, tipo, mime, link_url, storage_path, nome_arquivo, status, archived_at, leitura_status, leitura_em, leitura_tentativas")
    .eq("id", materialId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const mat = m as MaterialRow | null;
  if (!mat) return { ...base, status: "nao_encontrado", erro: "material não encontrado" };

  const claimObsoleto = mat.leitura_status === "lendo" && (!mat.leitura_em || mat.leitura_em < limiteClaimISO());
  const decisao = podeLer(
    { tipo: mat.tipo, mime: mat.mime, linkUrl: mat.link_url, storagePath: mat.storage_path, status: mat.status, archivedAt: mat.archived_at, leituraStatus: mat.leitura_status },
    !!args.forcar,
    claimObsoleto,
  );
  if (!decisao.ok) {
    if (decisao.statusDestino && decisao.statusDestino !== mat.leitura_status) {
      await marcar(supabase, tenantId, materialId, decisao.statusDestino, decisao.motivo, mat.leitura_status);
    }
    return { ...base, status: mat.leitura_status === "lendo" ? "em_leitura" : "nao_legivel", erro: decisao.motivo };
  }

  // Proposta aberta deste material? Sem forcar: devolve (nao gasta IA). Com forcar:
  // rejeita a anterior como substituida, para nao haver duas pendentes do mesmo PDF.
  const { data: abertas } = await supabase
    .from("price_submission")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("source_material_id", materialId)
    .in("status", ["draft", "pending_admin"]);
  const abertaIds = (abertas ?? []).map((r: { id: string }) => r.id);
  if (abertaIds.length > 0 && !args.forcar) return { ...base, status: "ja_lida", submissionId: abertaIds[0] };

  // Campus da proposta (a materializacao exige campus_id): so campi ATIVOS.
  const { data: campi } = await supabase
    .from("campus")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("supplier_id", mat.supplier_id)
    .eq("status", "active")
    .is("archived_at", null);
  const campus = resolverCampusParaLeitura((campi ?? []) as Array<{ id: string }>, args.campusId ?? null);
  if (!campus.ok) {
    await marcar(supabase, tenantId, materialId, "precisa_campus", campus.motivo, mat.leitura_status);
    return { ...base, status: "precisa_campus", erro: campus.motivo };
  }

  // Claim atomico: so um leitor por vez; um claim OBSOLETO pode ser retomado.
  const agora = new Date().toISOString();
  const { data: claim } = await supabase
    .from("material")
    .update({ leitura_status: "lendo", leitura_em: agora, leitura_erro: null })
    .eq("id", materialId)
    .eq("tenant_id", tenantId)
    .or(`leitura_status.neq.lendo,leitura_em.lt.${limiteClaimISO()}`)
    .select("id");
  if (!claim || claim.length === 0) return { ...base, status: "em_leitura", erro: "leitura já em andamento" };

  const tentativas = Number(mat.leitura_tentativas ?? 0);
  // Falha TRANSITORIA: volta a 'pendente' (reentra no cron) ate o teto; depois 'erro'.
  const falhaTransitoria = async (msg: string): Promise<ResultadoLeitura> => {
    const n = tentativas + 1;
    if (n < MAX_TENTATIVAS) {
      await marcar(supabase, tenantId, materialId, "pendente", `${msg} (tentativa ${n}/${MAX_TENTATIVAS} — volta à fila)`, "lendo", n);
      return { ...base, status: "pendente", erro: msg };
    }
    await marcar(supabase, tenantId, materialId, "erro", `${msg} (${MAX_TENTATIVAS} tentativas)`, "lendo", n);
    return { ...base, status: "erro", erro: msg };
  };

  try {
    const { data: blob, error: dlErr } = await supabase.storage.from(BUCKET).download(mat.storage_path as string);
    if (dlErr || !blob) return falhaTransitoria("não foi possível baixar o arquivo do Storage");
    if (typeof blob.size === "number" && blob.size > PDF_MAX_BYTES) {
      await marcar(supabase, tenantId, materialId, "erro", "PDF acima do limite de leitura", "lendo");
      return { ...base, status: "erro", erro: "PDF grande" };
    }
    const base64 = Buffer.from(await blob.arrayBuffer()).toString("base64");
    const ex = await extrairComTimeout(base64);
    if (!ex.ok) {
      if (ex.status === "sem_ia") {
        // Chave ausente: falha fechada e o material FICA na fila (nao gasta tentativa).
        await marcar(supabase, tenantId, materialId, "pendente", "IA não configurada (ANTHROPIC_API_KEY) — permanece na fila", "lendo");
        return { ...base, status: "sem_ia", erro: "sem_ia" };
      }
      return falhaTransitoria("a IA não conseguiu ler o PDF");
    }
    // Sem moeda identificavel a proposta nao materializa (a publicacao exige moeda
    // ISO) e o admin nao teria onde corrigir: erro DEFINITIVO com orientacao.
    if (!ex.dados.currency) {
      await marcar(supabase, tenantId, materialId, "erro", "moeda não identificada no PDF (ex.: CAD, EUR) — o PDF precisa indicar a moeda dos preços", "lendo");
      return { ...base, status: "erro", erro: "sem moeda" };
    }
    const itens = contarItens(ex.dados);
    if (itens === 0) {
      await marcar(supabase, tenantId, materialId, "erro", "a IA não encontrou programas, acomodações ou taxas no PDF", "lendo");
      return { ...base, status: "erro", erro: "sem itens" };
    }

    // "Ler de novo": a proposta aberta anterior deste material e substituida.
    if (abertaIds.length > 0) {
      await supabase
        .from("price_submission")
        .update({ status: "rejected", rejected_by: actor, rejected_at: agora, reject_reason: "Substituída por nova leitura do material.", updated_at: agora })
        .eq("tenant_id", tenantId)
        .in("id", abertaIds)
        .in("status", ["draft", "pending_admin"]);
    }

    const sub = await criarSubmission(supabase, {
      tenantId,
      supplierId: mat.supplier_id,
      campusId: campus.campusId,
      sourceStoragePath: mat.storage_path,
      sourceFilename: mat.nome_arquivo,
      extracted: ex.dados,
      extractStatus: "ok",
      createdBy: actor,
      status: "pending_admin", // direto na fila do admin: e ele quem publica
      sourceMaterialId: materialId,
      submittedBy: `leitura-ia:${actor}`,
    });
    if (!sub.ok) return falhaTransitoria(sub.erro);

    await marcar(supabase, tenantId, materialId, "lida", null, "lendo", 0);
    await registrarAuditoriaAdmin(supabase, {
      usuario: actor,
      acao: "fornecedores.material.ler",
      alvo: materialId,
      detalhe: { supplier_id: mat.supplier_id, campus_id: campus.campusId, submission_id: sub.id, itens, forcar: !!args.forcar, substituidas: abertaIds.length },
      ip: args.ip ?? null,
    });
    return { ...base, status: "lida", submissionId: sub.id, itens };
  } catch (err) {
    console.error("[material-leitura] falha inesperada:", err instanceof Error ? err.message : "erro");
    return falhaTransitoria("falha inesperada na leitura");
  }
}
