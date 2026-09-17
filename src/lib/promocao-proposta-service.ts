// PROPOSTAS DE PROMOCAO lidas por IA (F3.3) — parte impura, SERVER-ONLY (service
// role). Tabela promotion_submission: uma linha por promocao extraida de um material
// (flyer 'promocao', price list ou brochura). "A IA le, o humano publica": nada aqui
// cria promotion viva fora de aprovarPropostaPromocao, que passa pelo MESMO
// salvarPromocao/validarPromocao da tela manual (posse de supplier/campus/alvo
// conferida la). Toda query filtra tenant_id (guardrail tenant-isolation.test.ts).
import type { SupabaseClient } from "@supabase/supabase-js";
import { salvarPromocao, PromocaoAdminErro } from "@/lib/promocao-admin-service";
import { validarPromocao, type Falha } from "@/lib/promocao";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";
import { similaridadeTokens } from "@/lib/brochura-extract";
import { entradaPromocaoProposta, avisosDaPromocao, chaveDedupe, normalizarPromocoesExtraidas, type PromocaoExtraida } from "@/lib/promocao-extract";

const LIMIAR_CASAMENTO = Number(process.env.LEITURA_LIMIAR_CASAMENTO || "0.6");
const PREFIXO_IA = "leitura-ia:";
// 'processing' mais velho que isto = aprovacao que morreu no meio (crash/timeout):
// volta sozinho para pending_admin (mesmo padrao do claim obsoleto da leitura).
const PROCESSING_OBSOLETO_MIN = Number(process.env.PROPOSTA_PROCESSING_OBSOLETO_MIN || "15");

export type PropostaPromocaoResumo = {
  id: string;
  supplierId: string;
  supplierNome: string | null;
  campusId: string | null;
  nome: string;
  tipo: string | null;
  valor: number | null;
  aplicaA: string | null;
  reservaAte: string | null;
  status: string;
  avisos: string[];
  sourceMaterialId: string | null;
  sourceFilename: string | null;
  submittedBy: string | null;
  createdAt: string | null;
};
export type PropostaPromocaoDetalhe = PropostaPromocaoResumo & {
  extracted: PromocaoExtraida | null;
  entrada: Record<string, unknown>;
  rejectReason: string | null;
  promotionId: string | null;
};

const SEL =
  "id, tenant_id, supplier_id, campus_id, source_material_id, source_filename, extracted, entrada, avisos, status, promotion_id, submitted_by, reject_reason, created_at, supplier:supplier(display_name)";

function mapResumo(r: any): PropostaPromocaoResumo {
  const ex = (normalizarPromocoesExtraidas([r.extracted])[0] ?? null) as PromocaoExtraida | null;
  const sup = Array.isArray(r.supplier) ? r.supplier[0] : r.supplier;
  const entrada = (r.entrada && typeof r.entrada === "object" ? r.entrada : {}) as Record<string, unknown>;
  return {
    id: r.id,
    supplierId: r.supplier_id,
    supplierNome: sup?.display_name ?? null,
    campusId: r.campus_id ?? null,
    nome: typeof entrada.name === "string" && entrada.name ? entrada.name : ex?.nome ?? "(sem nome)",
    tipo: typeof entrada.promo_type === "string" && entrada.promo_type ? entrada.promo_type : ex?.tipo ?? null,
    valor: typeof entrada.value === "number" ? entrada.value : ex?.valor ?? null,
    aplicaA: typeof entrada.applies_to === "string" && entrada.applies_to ? entrada.applies_to : ex?.aplica_a ?? null,
    reservaAte: typeof entrada.booking_until === "string" && entrada.booking_until ? entrada.booking_until : ex?.reserva_ate ?? null,
    status: r.status,
    avisos: Array.isArray(r.avisos) ? r.avisos.filter((a: unknown) => typeof a === "string") : [],
    sourceMaterialId: r.source_material_id ?? null,
    sourceFilename: r.source_filename ?? null,
    submittedBy: r.submitted_by ?? null,
    createdAt: r.created_at ?? null,
  };
}

// Cria as propostas PENDENTES de um material. Dedupe por chave (nome+prazo) contra as
// propostas abertas do MESMO material; `forcar` substitui as abertas anteriores (como
// a proposta de preco). Alvo especifico e casado com os produtos do fornecedor por
// nome (Jaccard simetrico, mesmo limiar da brochura); sem casamento, cai para o curso
// em geral e o aviso conta isso ao admin. Nunca lanca.
export async function criarPropostasPromocao(
  supabase: SupabaseClient,
  args: {
    tenantId: string;
    supplierId: string;
    campusId: string | null;
    materialId: string;
    filename: string | null;
    promocoes: PromocaoExtraida[];
    produtos: Array<{ id: string; name: string }>;
    actor: string;
    forcar: boolean;
    hoje: string;
  },
): Promise<{ criadas: Array<{ id: string; nome: string; avisos: number }>; puladas: string[]; substituidas: number; falhas: string[] }> {
  const out = { criadas: [] as Array<{ id: string; nome: string; avisos: number }>, puladas: [] as string[], substituidas: 0, falhas: [] as string[] };
  if (args.promocoes.length === 0) return out;
  const agora = new Date().toISOString();

  const { data: abertas } = await supabase
    .from("promotion_submission")
    .select("id, extracted")
    .eq("tenant_id", args.tenantId)
    .eq("source_material_id", args.materialId)
    .eq("status", "pending_admin");
  const chaves = new Set<string>();
  if (args.forcar && (abertas?.length ?? 0) > 0) {
    const ids = (abertas ?? []).map((r: { id: string }) => r.id);
    const { data: rej } = await supabase
      .from("promotion_submission")
      .update({ status: "rejected", rejected_by: args.actor, rejected_at: agora, reject_reason: "Substituída por nova leitura do material.", updated_at: agora })
      .eq("tenant_id", args.tenantId)
      .in("id", ids)
      .eq("status", "pending_admin")
      .select("id");
    out.substituidas = rej?.length ?? 0;
  } else {
    for (const r of (abertas ?? []) as Array<{ extracted: unknown }>) {
      const ex = normalizarPromocoesExtraidas([r.extracted])[0];
      if (ex) chaves.add(chaveDedupe(ex));
    }
  }

  // Promocoes ATIVAS do fornecedor: aviso "ja existe parecida" (auditoria da IA).
  const { data: ativas } = await supabase
    .from("promotion")
    .select("name")
    .eq("tenant_id", args.tenantId)
    .eq("supplier_id", args.supplierId)
    .eq("status", "active")
    .is("archived_at", null);
  const nomesAtivos = ((ativas ?? []) as Array<{ name: string }>).map((a) => a.name);

  for (const p of args.promocoes) {
    const chave = chaveDedupe(p);
    if (chaves.has(chave)) {
      out.puladas.push(p.nome);
      continue;
    }
    chaves.add(chave);

    let refId: string | null = null;
    if (p.alvo_nome) {
      let melhor = 0;
      for (const prod of args.produtos) {
        const s = similaridadeTokens(p.alvo_nome, prod.name);
        if (s >= LIMIAR_CASAMENTO && s > melhor) {
          melhor = s;
          refId = prod.id;
        }
      }
    }
    const extras: string[] = [];
    if (refId) extras.push(`alvo:${refId}`);
    const parecida = nomesAtivos.find((n) => similaridadeTokens(n, p.nome) >= LIMIAR_CASAMENTO);
    if (parecida) extras.push(`já existe promoção ativa parecida: "${parecida}" — confira se é renovação ou duplicata`);
    const avisos = avisosDaPromocao(p, args.hoje, extras);
    const entrada = entradaPromocaoProposta(p, { supplierId: args.supplierId, campusId: args.campusId, refId });

    const { data: ins, error } = await supabase
      .from("promotion_submission")
      .insert({
        tenant_id: args.tenantId,
        supplier_id: args.supplierId,
        campus_id: args.campusId,
        source_material_id: args.materialId,
        source_filename: args.filename,
        extracted: p,
        entrada,
        avisos,
        status: "pending_admin",
        created_by: `${PREFIXO_IA}${args.actor}`,
        submitted_by: `${PREFIXO_IA}${args.actor}`,
      })
      .select("id")
      .single();
    if (error || !ins) {
      if (error) console.error("[promocao-proposta] inserir:", error.message);
      out.falhas.push(p.nome);
      continue;
    }
    out.criadas.push({ id: (ins as { id: string }).id, nome: p.nome, avisos: avisos.length });
  }
  return out;
}

// Destrava propostas presas em 'processing' (claim obsoleto). Escopo tenant (+ id).
// Chamado na aprovacao/recusa (por id) e pelo cron (tenant inteiro) — nunca em render.
export async function liberarProcessingObsoleto(supabase: SupabaseClient, tenantId: string, id?: string): Promise<void> {
  const limite = new Date(Date.now() - PROCESSING_OBSOLETO_MIN * 60_000).toISOString();
  let q = supabase
    .from("promotion_submission")
    .update({ status: "pending_admin", updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("status", "processing")
    .lt("updated_at", limite);
  if (id) q = q.eq("id", id);
  await q;
}

export async function listarPropostasPromocao(
  supabase: SupabaseClient,
  tenantId: string,
  filtro?: { supplierId?: string; status?: string },
): Promise<PropostaPromocaoResumo[]> {
  let q = supabase.from("promotion_submission").select(SEL).eq("tenant_id", tenantId).order("created_at", { ascending: true });
  if (filtro?.supplierId) q = q.eq("supplier_id", filtro.supplierId);
  if (filtro?.status === "pending_admin") q = q.in("status", ["pending_admin", "processing"]);
  else if (filtro?.status) q = q.eq("status", filtro.status);
  const { data } = await q;
  return (data ?? []).map(mapResumo);
}

export async function obterPropostaPromocao(supabase: SupabaseClient, tenantId: string, id: string): Promise<PropostaPromocaoDetalhe | null> {
  const { data } = await supabase.from("promotion_submission").select(SEL).eq("id", id).eq("tenant_id", tenantId).maybeSingle();
  if (!data) return null;
  const r = data as any;
  return {
    ...mapResumo(r),
    extracted: normalizarPromocoesExtraidas([r.extracted])[0] ?? null,
    entrada: (r.entrada && typeof r.entrada === "object" ? r.entrada : {}) as Record<string, unknown>,
    rejectReason: r.reject_reason ?? null,
    promotionId: r.promotion_id ?? null,
  };
}

// Campos que o admin pode ajustar na revisao. supplier_id NUNCA vem do cliente.
const AJUSTAVEIS = [
  "name", "promo_type", "value", "free_units_semantics", "applies_to", "applies_to_ref_id", "min_quantity",
  "max_discount_amount", "is_stackable", "booking_from", "booking_until", "travel_from", "travel_until", "campus_id",
] as const;

function aplicarAjustes(entrada: Record<string, unknown>, ajustes: unknown): Record<string, unknown> {
  const out = { ...entrada };
  if (ajustes && typeof ajustes === "object" && !Array.isArray(ajustes)) {
    for (const k of AJUSTAVEIS) {
      if (k in (ajustes as Record<string, unknown>)) out[k] = (ajustes as Record<string, unknown>)[k];
    }
  }
  return out;
}

const ERRO_LABEL: Record<string, string> = {
  validacao: "A proposta tem campos inválidos.",
  supplier_invalido: "Fornecedor inválido para este tenant.",
  campus_invalido: "O campus escolhido não é deste fornecedor.",
  ref_invalido: "O alvo específico (curso/taxa) não é deste fornecedor.",
  promocao_nao_encontrada: "Promoção não encontrada.",
  falha_persistir: "Falha ao gravar a promoção.",
};

// Aprova e PUBLICA: cria a promotion (status 'active') via salvarPromocao — a mesma
// validacao/posse da tela manual. CAS pending_admin -> processing (sem aprovacao
// dupla); qualquer falha devolve a proposta para pending_admin com as falhas de campo.
export async function aprovarPropostaPromocao(
  supabase: SupabaseClient,
  args: { tenantId: string; id: string; actor: string; ip?: string | null; ajustes?: unknown },
): Promise<{ ok: true; promotionId: string; nome: string; supplierId: string } | { ok: false; erro: string; falhas?: Falha[] }> {
  const { tenantId, id, actor } = args;
  await liberarProcessingObsoleto(supabase, tenantId, id);
  const atual = await obterPropostaPromocao(supabase, tenantId, id);
  if (!atual) return { ok: false, erro: "Proposta não encontrada." };
  if (atual.status === "processing") return { ok: false, erro: `Proposta em processamento — tente de novo em ${PROCESSING_OBSOLETO_MIN} min.` };
  if (atual.status !== "pending_admin") return { ok: false, erro: `Proposta já ${atual.status === "approved" ? "publicada" : "processada"}.` };

  const agora = new Date().toISOString();
  const { data: claim } = await supabase
    .from("promotion_submission")
    .update({ status: "processing", updated_at: agora })
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .eq("status", "pending_admin")
    .select("id");
  if (!claim || claim.length === 0) return { ok: false, erro: "Proposta em processamento por outro admin." };

  const voltar = async () => {
    await supabase.from("promotion_submission").update({ status: "pending_admin", updated_at: new Date().toISOString() }).eq("id", id).eq("tenant_id", tenantId).eq("status", "processing");
  };

  // supplier_id e SEMPRE o da proposta; status 'active' = publicar (o humano decidiu).
  const entrada = { ...aplicarAjustes(atual.entrada, args.ajustes), supplier_id: atual.supplierId, status: "active" };
  const v = validarPromocao(entrada);
  if (!v.ok) {
    await voltar();
    return { ok: false, erro: ERRO_LABEL.validacao, falhas: v.falhas };
  }

  let promotionId: string;
  try {
    const r = await salvarPromocao(supabase, { tenantId, actor, ip: args.ip ?? null, entrada });
    promotionId = r.id;
  } catch (e) {
    await voltar();
    if (e instanceof PromocaoAdminErro) return { ok: false, erro: ERRO_LABEL[e.codigo] ?? e.codigo, falhas: e.falhas };
    console.error("[promocao-proposta] aprovar:", e instanceof Error ? e.message : "erro");
    return { ok: false, erro: ERRO_LABEL.falha_persistir };
  }

  // Fecha a proposta. Se ESTE passo falhar, a promocao recem-criada (que ninguem viu
  // ainda) e apagada e a proposta volta a pending_admin — nunca fica promocao viva
  // com proposta presa em processing/sem vinculo/sem trilha.
  const fim = new Date().toISOString();
  const entradaCanonica = { ...v.valor.promotion, targets: v.valor.targets };
  const { data: fechada, error: eFechar } = await supabase
    .from("promotion_submission")
    .update({ status: "approved", entrada: entradaCanonica, promotion_id: promotionId, admin_approved_by: actor, admin_approved_at: fim, updated_at: fim })
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .eq("status", "processing")
    .select("id");
  if (eFechar || !fechada || fechada.length === 0) {
    if (eFechar) console.error("[promocao-proposta] fechar aprovacao:", eFechar.message);
    const { error: eComp } = await supabase.from("promotion").delete().eq("id", promotionId).eq("tenant_id", tenantId);
    if (eComp) console.error("[promocao-proposta] compensacao (apagar promocao) falhou:", eComp.message, promotionId);
    await voltar();
    return { ok: false, erro: ERRO_LABEL.falha_persistir };
  }
  const { error: eVinc } = await supabase.from("promotion").update({ source_submission_id: id }).eq("id", promotionId).eq("tenant_id", tenantId);
  if (eVinc) console.error("[promocao-proposta] vinculo source_submission_id falhou:", eVinc.message);

  await registrarAuditoriaAdmin(supabase, {
    usuario: actor,
    acao: "fornecedores.promocao_proposta.aprovar",
    alvo: id,
    detalhe: { supplier_id: atual.supplierId, promotion_id: promotionId, name: v.valor.promotion.name, promo_type: v.valor.promotion.promo_type, booking_until: v.valor.promotion.booking_until, ajustado: !!args.ajustes },
    ip: args.ip ?? null,
  });
  return { ok: true, promotionId, nome: v.valor.promotion.name, supplierId: atual.supplierId };
}

export async function rejeitarPropostaPromocao(
  supabase: SupabaseClient,
  args: { tenantId: string; id: string; actor: string; ip?: string | null; motivo: string },
): Promise<{ ok: true; supplierId: string } | { ok: false; erro: string }> {
  await liberarProcessingObsoleto(supabase, args.tenantId, args.id);
  const atual = await obterPropostaPromocao(supabase, args.tenantId, args.id);
  if (!atual) return { ok: false, erro: "Proposta não encontrada." };
  if (atual.status !== "pending_admin") return { ok: false, erro: "Proposta já processada." };
  const agora = new Date().toISOString();
  const { data } = await supabase
    .from("promotion_submission")
    .update({ status: "rejected", rejected_by: args.actor, rejected_at: agora, reject_reason: args.motivo.slice(0, 1000), updated_at: agora })
    .eq("id", args.id)
    .eq("tenant_id", args.tenantId)
    .eq("status", "pending_admin")
    .select("id");
  if (!data || data.length === 0) return { ok: false, erro: "Proposta já processada." };
  await registrarAuditoriaAdmin(supabase, {
    usuario: args.actor,
    acao: "fornecedores.promocao_proposta.rejeitar",
    alvo: args.id,
    detalhe: { supplier_id: atual.supplierId, motivo: args.motivo.slice(0, 1000) },
    ip: args.ip ?? null,
  });
  return { ok: true, supplierId: atual.supplierId };
}
