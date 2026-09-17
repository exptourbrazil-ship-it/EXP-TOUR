// PROPOSTAS DE DISPONIBILIDADE lidas por IA (F3.4) — parte impura, SERVER-ONLY.
// Tabela availability_submission: uma linha por leitura de material (calendario,
// price list ou brochura) com o PLANO item a item ja comparado ao publicado.
// "A IA le, o humano publica": nada aqui grava disponibilidade viva fora de
// aprovarPropostaDisponibilidade, que usa salvarIntake/salvarPeriodo (posse
// product->campus->supplier + trilha em product_availability_log, actorKind 'admin').
// Toda query filtra tenant_id (guardrail tenant-isolation.test.ts).
import type { SupabaseClient } from "@supabase/supabase-js";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";
import { similaridadeTokens } from "@/lib/brochura-extract";
import { listarProgramasComIntakes, listarAcomodacoesComPeriodos, salvarIntake, salvarPeriodo } from "@/lib/catalog-disponibilidade";
import { validarIntake, validarPeriodo } from "@/lib/disponibilidade";
import {
  planejarDisponibilidade,
  avisosDoPlano,
  normalizarDisponibilidadeExtraida,
  type DisponibilidadeExtraida,
  type PlanoDisponibilidade,
  type ItemPlano,
  type Casamento,
  type ProdutoCasado,
} from "@/lib/disponibilidade-extract";

const LIMIAR_CASAMENTO = Number(process.env.LEITURA_LIMIAR_CASAMENTO || "0.6");
const PREFIXO_IA = "leitura-ia:";
const PROCESSING_OBSOLETO_MIN = Number(process.env.PROPOSTA_PROCESSING_OBSOLETO_MIN || "15");

export type PropostaDisponibilidadeResumo = {
  id: string;
  supplierId: string;
  supplierNome: string | null;
  status: string;
  itens: number;
  criar: number;
  alterar: number;
  avisos: string[];
  sourceMaterialId: string | null;
  sourceFilename: string | null;
  submittedBy: string | null;
  createdAt: string | null;
};
export type PropostaDisponibilidadeDetalhe = PropostaDisponibilidadeResumo & {
  extracted: DisponibilidadeExtraida;
  plano: PlanoDisponibilidade;
  aplicacao: unknown;
  rejectReason: string | null;
};

const SEL = "id, tenant_id, supplier_id, source_material_id, source_filename, extracted, plano, avisos, status, aplicacao, submitted_by, reject_reason, created_at, supplier:supplier(display_name)";

function planoDe(raw: unknown): PlanoDisponibilidade {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<PlanoDisponibilidade>;
  return { itens: Array.isArray(r.itens) ? (r.itens as ItemPlano[]) : [], semProduto: Array.isArray(r.semProduto) ? r.semProduto : [], regras: Array.isArray(r.regras) ? r.regras : [] };
}
function mapResumo(r: any): PropostaDisponibilidadeResumo {
  const plano = planoDe(r.plano);
  const sup = Array.isArray(r.supplier) ? r.supplier[0] : r.supplier;
  return {
    id: r.id,
    supplierId: r.supplier_id,
    supplierNome: sup?.display_name ?? null,
    status: r.status,
    itens: plano.itens.length,
    criar: plano.itens.filter((i) => i.acao === "criar").length,
    alterar: plano.itens.filter((i) => i.acao === "alterar").length,
    avisos: Array.isArray(r.avisos) ? r.avisos.filter((a: unknown) => typeof a === "string") : [],
    sourceMaterialId: r.source_material_id ?? null,
    sourceFilename: r.source_filename ?? null,
    submittedBy: r.submitted_by ?? null,
    createdAt: r.created_at ?? null,
  };
}

// Defesa em profundidade: o fornecedor tem que ser do tenant (os readers de
// disponibilidade sao escopados por supplier, nao por tenant).
async function supplierDoTenant(supabase: SupabaseClient, tenantId: string, supplierId: string): Promise<boolean> {
  const { data } = await supabase.from("supplier").select("id").eq("id", supplierId).eq("tenant_id", tenantId).maybeSingle();
  return !!data;
}

function melhor(nome: string, candidatos: Array<{ id: string; name: string }>): ProdutoCasado | null {
  let out: ProdutoCasado | null = null;
  for (const c of candidatos) {
    const s = similaridadeTokens(nome, c.name);
    if (s >= LIMIAR_CASAMENTO && (!out || s > out.score)) out = { id: c.id, name: c.name, score: s };
  }
  return out;
}

// Cria UMA proposta pendente para o material (plano completo). `forcar` substitui a
// aberta anterior do mesmo material. Sem itens casados -> nao cria (motivo). Nunca lanca.
export async function criarPropostaDisponibilidade(
  supabase: SupabaseClient,
  args: { tenantId: string; supplierId: string; materialId: string; filename: string | null; dados: DisponibilidadeExtraida; actor: string; forcar: boolean; hoje: string },
): Promise<{ id: string | null; itens: number; criar: number; alterar: number; substituidas: number; motivo: string | null }> {
  const out = { id: null as string | null, itens: 0, criar: 0, alterar: 0, substituidas: 0, motivo: null as string | null };
  if (args.dados.intakes.length === 0 && args.dados.periodos.length === 0) return out;
  if (!(await supplierDoTenant(supabase, args.tenantId, args.supplierId))) {
    out.motivo = "fornecedor não pertence a este tenant";
    return out;
  }

  const { data: abertas } = await supabase
    .from("availability_submission")
    .select("id")
    .eq("tenant_id", args.tenantId)
    .eq("source_material_id", args.materialId)
    .eq("status", "pending_admin");
  const abertasIds = (abertas ?? []).map((r: { id: string }) => r.id);
  if (abertasIds.length > 0 && !args.forcar) {
    out.motivo = "já há proposta de disponibilidade deste material aguardando aprovação";
    return out;
  }

  // Publicado hoje (escopo do fornecedor via product->campus->supplier no service).
  const [programas, acomodacoes] = await Promise.all([listarProgramasComIntakes(supabase, args.supplierId), listarAcomodacoesComPeriodos(supabase, args.supplierId)]);
  const casamento: Casamento = { programas: {}, acomodacoes: {} };
  for (const i of args.dados.intakes) casamento.programas[i.programa] ??= melhor(i.programa, programas);
  for (const p of args.dados.periodos) casamento.acomodacoes[p.acomodacao] ??= melhor(p.acomodacao, acomodacoes);
  const existentes = {
    intakes: Object.fromEntries(programas.map((p) => [p.id, p.intakes.map((i) => ({ startDate: i.startDate, status: i.status, capacity: i.capacity, notes: i.notes }))])),
    periodos: Object.fromEntries(acomodacoes.map((a) => [a.id, a.periodos.map((x) => ({ periodStart: x.periodStart, periodEnd: x.periodEnd, status: x.status, notes: x.notes }))])),
  };
  const plano = planejarDisponibilidade(args.dados, casamento, existentes, args.hoje);
  if (plano.itens.length === 0) {
    out.motivo = plano.semProduto.length ? `nenhum programa/acomodação do documento corresponde ao catálogo (${plano.semProduto.slice(0, 4).join(", ")})` : "o documento não trouxe datas explícitas";
    return out;
  }
  const avisos = avisosDoPlano(plano);

  const { data: ins, error } = await supabase
    .from("availability_submission")
    .insert({
      tenant_id: args.tenantId,
      supplier_id: args.supplierId,
      source_material_id: args.materialId,
      source_filename: args.filename,
      extracted: args.dados,
      plano,
      avisos,
      status: "pending_admin",
      created_by: `${PREFIXO_IA}${args.actor}`,
      submitted_by: `${PREFIXO_IA}${args.actor}`,
    })
    .select("id")
    .single();
  if (error || !ins) {
    if (error) console.error("[disponibilidade-proposta] inserir:", error.message);
    out.motivo = "falha ao gravar a proposta";
    return out;
  }
  out.id = (ins as { id: string }).id;
  // Forcar: so DEPOIS de a nova existir e que as anteriores sao substituidas (nunca
  // fica sem proposta se o plano vier vazio ou o insert falhar).
  if (abertasIds.length > 0) {
    const agora = new Date().toISOString();
    const { data: rej } = await supabase
      .from("availability_submission")
      .update({ status: "rejected", rejected_by: args.actor, rejected_at: agora, reject_reason: "Substituída por nova leitura do material.", updated_at: agora })
      .eq("tenant_id", args.tenantId)
      .in("id", abertasIds)
      .eq("status", "pending_admin")
      .select("id");
    out.substituidas = rej?.length ?? 0;
  }
  out.itens = plano.itens.length;
  out.criar = plano.itens.filter((i) => i.acao === "criar").length;
  out.alterar = plano.itens.filter((i) => i.acao === "alterar").length;
  return out;
}

// Chamado na aprovacao/recusa (por id) e pelo cron (tenant inteiro) — nunca em render.
export async function liberarProcessingObsoleto(supabase: SupabaseClient, tenantId: string, id?: string): Promise<void> {
  const limite = new Date(Date.now() - PROCESSING_OBSOLETO_MIN * 60_000).toISOString();
  let q = supabase.from("availability_submission").update({ status: "pending_admin", updated_at: new Date().toISOString() }).eq("tenant_id", tenantId).eq("status", "processing").lt("updated_at", limite);
  if (id) q = q.eq("id", id);
  await q;
}

export async function listarPropostasDisponibilidade(supabase: SupabaseClient, tenantId: string, filtro?: { supplierId?: string; status?: string }): Promise<PropostaDisponibilidadeResumo[]> {
  let q = supabase.from("availability_submission").select(SEL).eq("tenant_id", tenantId).order("created_at", { ascending: true });
  if (filtro?.supplierId) q = q.eq("supplier_id", filtro.supplierId);
  // "pendentes" inclui as em processamento (visiveis, com rotulo) — o destravamento
  // do processing obsoleto acontece na aprovacao/recusa e no cron, nao aqui.
  if (filtro?.status === "pending_admin") q = q.in("status", ["pending_admin", "processing"]);
  else if (filtro?.status) q = q.eq("status", filtro.status);
  const { data } = await q;
  return (data ?? []).map(mapResumo);
}

export async function obterPropostaDisponibilidade(supabase: SupabaseClient, tenantId: string, id: string): Promise<PropostaDisponibilidadeDetalhe | null> {
  const { data } = await supabase.from("availability_submission").select(SEL).eq("id", id).eq("tenant_id", tenantId).maybeSingle();
  if (!data) return null;
  const r = data as any;
  return { ...mapResumo(r), extracted: normalizarDisponibilidadeExtraida(r.extracted), plano: planoDe(r.plano), aplicacao: r.aplicacao ?? null, rejectReason: r.reject_reason ?? null };
}

// Aprova e PUBLICA os itens escolhidos (chaves). CAS pending_admin -> processing. Cada
// item passa por validarIntake/validarPeriodo + salvarIntake/salvarPeriodo (posse e
// trilha). Upsert idempotente: se a funcao morrer no meio, o 'processing' obsoleto
// volta a pending e re-aprovar repete o mesmo resultado, sem duplicar.
export async function aprovarPropostaDisponibilidade(
  supabase: SupabaseClient,
  args: { tenantId: string; id: string; actor: string; ip?: string | null; chaves: unknown },
): Promise<{ ok: true; aplicados: number; falhas: string[]; supplierId: string } | { ok: false; erro: string }> {
  const { tenantId, id, actor } = args;
  await liberarProcessingObsoleto(supabase, tenantId, id);
  const atual = await obterPropostaDisponibilidade(supabase, tenantId, id);
  if (!atual) return { ok: false, erro: "Proposta não encontrada." };
  if (atual.status === "processing") return { ok: false, erro: `Proposta em processamento — tente de novo em ${PROCESSING_OBSOLETO_MIN} min.` };
  if (atual.status !== "pending_admin") return { ok: false, erro: "Proposta já processada." };

  if (!(await supplierDoTenant(supabase, tenantId, atual.supplierId))) return { ok: false, erro: "Fornecedor não pertence a este tenant." };

  const escolhidas = new Set(Array.isArray(args.chaves) ? args.chaves.slice(0, 10000).filter((c): c is string => typeof c === "string") : []);
  // Retomada: itens ja publicados numa tentativa anterior (funcao morreu no meio) sao pulados.
  const feitasAntes = new Set<string>(
    Array.isArray((atual.aplicacao as any)?.chaves_feitas) ? ((atual.aplicacao as any).chaves_feitas as unknown[]).filter((c): c is string => typeof c === "string") : [],
  );
  const itens = atual.plano.itens.filter((i) => escolhidas.has(i.chave) && i.acao !== "igual");
  if (itens.length === 0) return { ok: false, erro: "Escolha ao menos um item para publicar." };

  const agora = new Date().toISOString();
  const { data: claim } = await supabase.from("availability_submission").update({ status: "processing", updated_at: agora }).eq("id", id).eq("tenant_id", tenantId).eq("status", "pending_admin").select("id");
  if (!claim || claim.length === 0) return { ok: false, erro: "Proposta em processamento por outro admin." };

  // O plano foi calculado na LEITURA; reconfere o publicado AGORA: item cujo estado
  // atual difere do snapshot mudou desde a leitura (escola/admin mexeu) -> nao publica.
  const [progAgora, acomAgora] = await Promise.all([listarProgramasComIntakes(supabase, atual.supplierId), listarAcomodacoesComPeriodos(supabase, atual.supplierId)]);
  const intakesAgora = new Map(progAgora.map((p) => [p.id, p.intakes]));
  const periodosAgora = new Map(acomAgora.map((a) => [a.id, a.periodos]));
  const mudou = (it: ItemPlano): boolean => {
    if (it.tipo === "intake") {
      const cur = (intakesAgora.get(it.productId) ?? []).find((x) => x.startDate === it.startDate) ?? null;
      if (!cur) return it.atual !== null;
      return !it.atual || cur.status !== it.atual.status || cur.capacity !== it.atual.capacity || (cur.notes ?? null) !== (it.atual.notes ?? null);
    }
    const cur = (periodosAgora.get(it.productId) ?? []).find((x) => x.periodStart === it.periodStart) ?? null;
    if (!cur) return it.atual !== null;
    return !it.atual || cur.status !== it.atual.status || cur.periodEnd !== it.atual.periodEnd || (cur.notes ?? null) !== (it.atual.notes ?? null);
  };

  const falhas: string[] = [];
  const chavesFeitas: string[] = Array.from(feitasAntes);
  let aplicados = 0;
  let desdeCheckpoint = 0;
  const checkpoint = async () => {
    await supabase.from("availability_submission").update({ aplicacao: { parcial: true, chaves_feitas: chavesFeitas }, updated_at: new Date().toISOString() }).eq("id", id).eq("tenant_id", tenantId).eq("status", "processing");
    desdeCheckpoint = 0;
  };
  for (const it of itens) {
    if (feitasAntes.has(it.chave)) {
      aplicados++;
      continue;
    }
    if (mudou(it)) {
      falhas.push(`${it.produto} ${it.tipo === "intake" ? it.startDate : it.periodStart}: mudou desde a leitura — releia o material`);
      continue;
    }
    if (it.tipo === "intake") {
      const v = validarIntake({ startDate: it.startDate, status: it.status, capacity: it.capacity, notes: it.notes });
      if (!v.ok) {
        falhas.push(`${it.produto} ${it.startDate}: ${v.erro}`);
        continue;
      }
      const r = await salvarIntake(supabase, atual.supplierId, tenantId, it.productId, v.dados, actor, "admin");
      if (!r.ok) falhas.push(`${it.produto} ${it.startDate}: ${r.erro ?? "falha"}`);
      else {
        aplicados++;
        chavesFeitas.push(it.chave);
        if (++desdeCheckpoint >= 25) await checkpoint();
      }
    } else {
      const v = validarPeriodo({ periodStart: it.periodStart, periodEnd: it.periodEnd, status: it.status, notes: it.notes });
      if (!v.ok) {
        falhas.push(`${it.produto} ${it.periodStart}: ${v.erro}`);
        continue;
      }
      const r = await salvarPeriodo(supabase, atual.supplierId, tenantId, it.productId, v.dados, actor, "admin");
      if (!r.ok) falhas.push(`${it.produto} ${it.periodStart}: ${r.erro ?? "falha"}`);
      else {
        aplicados++;
        chavesFeitas.push(it.chave);
        if (++desdeCheckpoint >= 25) await checkpoint();
      }
    }
  }

  const fim = new Date().toISOString();
  // Nada publicado e tudo falhou: NAO fecha como aprovada — volta a fila com as falhas.
  if (aplicados === 0) {
    await supabase.from("availability_submission").update({ status: "pending_admin", aplicacao: { parcial: false, falhas, em: fim }, updated_at: fim }).eq("id", id).eq("tenant_id", tenantId).eq("status", "processing");
    return { ok: false, erro: `Nada publicado: ${falhas.slice(0, 3).join("; ")}${falhas.length > 3 ? "…" : ""}` };
  }
  const aplicacao = { aplicados, falhas, chaves: Array.from(escolhidas), chaves_feitas: chavesFeitas, em: fim };
  const { data: fechada, error } = await supabase
    .from("availability_submission")
    .update({ status: "approved", aplicacao, admin_approved_by: actor, admin_approved_at: fim, updated_at: fim })
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .eq("status", "processing")
    .select("id");
  if (error || !fechada || fechada.length === 0) {
    // Upserts ja publicados sao idempotentes; a proposta volta a fila e re-aprovar repete sem duplicar.
    if (error) console.error("[disponibilidade-proposta] fechar aprovacao:", error.message);
    await supabase.from("availability_submission").update({ status: "pending_admin", updated_at: new Date().toISOString() }).eq("id", id).eq("tenant_id", tenantId).eq("status", "processing");
    return { ok: false, erro: "Itens publicados, mas a proposta não pôde ser fechada — recarregue e aprove de novo (não duplica)." };
  }
  await registrarAuditoriaAdmin(supabase, {
    usuario: actor,
    acao: "fornecedores.disponibilidade_proposta.aprovar",
    alvo: id,
    detalhe: { supplier_id: atual.supplierId, aplicados, falhas: falhas.length, escolhidos: itens.length, source_material_id: atual.sourceMaterialId },
    ip: args.ip ?? null,
  });
  return { ok: true, aplicados, falhas, supplierId: atual.supplierId };
}

export async function rejeitarPropostaDisponibilidade(
  supabase: SupabaseClient,
  args: { tenantId: string; id: string; actor: string; ip?: string | null; motivo: string },
): Promise<{ ok: true } | { ok: false; erro: string }> {
  await liberarProcessingObsoleto(supabase, args.tenantId, args.id);
  const agora = new Date().toISOString();
  const { data } = await supabase
    .from("availability_submission")
    .update({ status: "rejected", rejected_by: args.actor, rejected_at: agora, reject_reason: args.motivo.slice(0, 1000), updated_at: agora })
    .eq("id", args.id)
    .eq("tenant_id", args.tenantId)
    .eq("status", "pending_admin")
    .select("id, supplier_id");
  if (!data || data.length === 0) return { ok: false, erro: "Proposta não encontrada ou já processada." };
  await registrarAuditoriaAdmin(supabase, {
    usuario: args.actor,
    acao: "fornecedores.disponibilidade_proposta.rejeitar",
    alvo: args.id,
    detalhe: { supplier_id: (data[0] as { supplier_id: string }).supplier_id, motivo: args.motivo.slice(0, 1000) },
    ip: args.ip ?? null,
  });
  return { ok: true };
}
