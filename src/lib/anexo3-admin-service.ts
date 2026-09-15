// CRUD admin das entidades do Anexo III v3.1 (taxa_obrigatoria,
// exigencia_antecipacao, campus_politica), todas ESCOPADAS POR CAMPUS.
// SERVER-ONLY (service role). Valida com os validadores puros de
// anexo3-entidades.ts e barra campus fora do escopo de tenant do admin (falha
// FECHADA: 404 uniforme, não vaza existência). A autorização de capacidade
// (config.gerir) é feita na ROTA; aqui garantimos o corte por tenant + validação.
import type { SupabaseClient } from "@supabase/supabase-js";
import { escopoTenantAdmin, escopoPermiteContrato } from "@/lib/admin-tenant";
import {
  validarTaxaObrigatoria,
  validarExigenciaAntecipacao,
  validarEscolaCampusPolitica,
  type Falha,
} from "@/lib/anexo3-entidades";

export type ResultadoAdmin<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; status: number; erro: string };

function erroValidacao(erros: Falha[]): { ok: false; status: number; erro: string } {
  return { ok: false, status: 400, erro: erros.map((e) => `${e.campo}: ${e.erro}`).join("; ") };
}

// Resolve o campus e garante que está no escopo de tenant do admin. 404 uniforme
// (não distingue "não existe" de "de outro tenant") — falha fechada.
async function campusNoEscopo(
  supabase: SupabaseClient,
  campusId: string,
): Promise<ResultadoAdmin<{ tenantId: string; baseCurrency: string }>> {
  if (!campusId) return { ok: false, status: 400, erro: "campus obrigatório" };
  const escopo = await escopoTenantAdmin(supabase);
  const { data } = await supabase
    .from("campus")
    .select("tenant_id, base_currency")
    .eq("id", campusId)
    .maybeSingle();
  if (!data) return { ok: false, status: 404, erro: "Campus não encontrado." };
  const tenantId = (data.tenant_id as string) ?? null;
  if (!escopoPermiteContrato(escopo, tenantId)) return { ok: false, status: 404, erro: "Campus não encontrado." };
  return { ok: true, data: { tenantId: tenantId as string, baseCurrency: ((data.base_currency as string) || "BRL").toUpperCase() } };
}

// ── TaxaObrigatoria ──────────────────────────────────────────────────────────

export async function listarTaxasObrigatorias(supabase: SupabaseClient, campusId: string): Promise<ResultadoAdmin> {
  const g = await campusNoEscopo(supabase, campusId);
  if (!g.ok) return g;
  const { data, error } = await supabase
    .from("taxa_obrigatoria")
    .select("id, nome, valor, moeda, condicao_aplicacao, duracao_minima_semanas, reembolsavel, vencimento_dias, componente, ativo, ordem")
    .eq("campus_id", campusId)
    .order("ordem", { ascending: true })
    .order("nome", { ascending: true });
  if (error) return { ok: false, status: 500, erro: "Falha ao listar as taxas." };
  return { ok: true, data: data ?? [] };
}

export async function criarTaxaObrigatoria(
  supabase: SupabaseClient,
  campusId: string,
  raw: Record<string, unknown>,
): Promise<ResultadoAdmin<{ id: string }>> {
  const g = await campusNoEscopo(supabase, campusId);
  if (!g.ok) return g;
  const val = validarTaxaObrigatoria({ ...raw, escolaCampusId: campusId, moeda: raw.moeda || g.data.baseCurrency });
  if (!val.ok) return erroValidacao(val.erros);
  const t = val.valor;
  const { data, error } = await supabase
    .from("taxa_obrigatoria")
    .insert({
      tenant_id: g.data.tenantId,
      campus_id: campusId,
      nome: t.nome,
      valor: t.valor,
      moeda: t.moeda,
      condicao_aplicacao: t.condicaoAplicacao,
      duracao_minima_semanas: t.duracaoMinimaSemanas,
      reembolsavel: t.reembolsavel,
      vencimento_dias: t.vencimentoDias,
      componente: t.componente,
      ordem: t.ordem,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, status: 500, erro: "Falha ao salvar a taxa." };
  return { ok: true, data: { id: data.id as string } };
}

export async function removerTaxaObrigatoria(supabase: SupabaseClient, id: string): Promise<ResultadoAdmin> {
  if (!id) return { ok: false, status: 400, erro: "id obrigatório" };
  const { data: linha } = await supabase.from("taxa_obrigatoria").select("campus_id").eq("id", id).maybeSingle();
  // 404 UNIFORME: inexistente e fora-de-escopo devolvem a MESMA resposta (não
  // vaza existência entre tenants).
  if (!linha) return { ok: false, status: 404, erro: "Taxa não encontrada." };
  const g = await campusNoEscopo(supabase, linha.campus_id as string);
  if (!g.ok) return { ok: false, status: 404, erro: "Taxa não encontrada." };
  const { error } = await supabase.from("taxa_obrigatoria").delete().eq("id", id);
  if (error) return { ok: false, status: 500, erro: "Falha ao remover a taxa." };
  return { ok: true, data: { id } };
}

// ── ExigenciaAntecipacao ─────────────────────────────────────────────────────

export async function listarExigencias(supabase: SupabaseClient, campusId: string): Promise<ResultadoAdmin> {
  const g = await campusNoEscopo(supabase, campusId);
  if (!g.ok) return g;
  const { data, error } = await supabase
    .from("exigencia_antecipacao")
    .select("id, ativa, evento_gerador, documento_viabilizado, valor, percentual, moeda, data_limite_ancora, data_limite_unidade, data_limite_valor, comprovante_ref, condicao")
    .eq("campus_id", campusId)
    .order("created_at", { ascending: true });
  if (error) return { ok: false, status: 500, erro: "Falha ao listar as exigências." };
  return { ok: true, data: data ?? [] };
}

export async function criarExigencia(
  supabase: SupabaseClient,
  campusId: string,
  raw: Record<string, unknown>,
): Promise<ResultadoAdmin<{ id: string }>> {
  const g = await campusNoEscopo(supabase, campusId);
  if (!g.ok) return g;
  const val = validarExigenciaAntecipacao({ ...raw, escolaCampusId: campusId });
  if (!val.ok) return erroValidacao(val.erros);
  const e = val.valor;
  const { data, error } = await supabase
    .from("exigencia_antecipacao")
    .insert({
      tenant_id: g.data.tenantId,
      campus_id: campusId,
      ativa: e.ativa,
      evento_gerador: e.eventoGerador,
      documento_viabilizado: e.documentoViabilizado,
      valor: e.valor,
      percentual: e.percentual,
      moeda: e.moeda,
      data_limite_ancora: e.dataLimiteAncora,
      data_limite_unidade: e.dataLimiteUnidade,
      data_limite_valor: e.dataLimiteValor,
      comprovante_ref: e.comprovanteRef,
      condicao: e.condicao,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, status: 500, erro: "Falha ao salvar a exigência." };
  return { ok: true, data: { id: data.id as string } };
}

export async function removerExigencia(supabase: SupabaseClient, id: string): Promise<ResultadoAdmin> {
  if (!id) return { ok: false, status: 400, erro: "id obrigatório" };
  const { data: linha } = await supabase.from("exigencia_antecipacao").select("campus_id").eq("id", id).maybeSingle();
  // 404 UNIFORME (ver removerTaxaObrigatoria): inexistente e fora-de-escopo iguais.
  if (!linha) return { ok: false, status: 404, erro: "Exigência não encontrada." };
  const g = await campusNoEscopo(supabase, linha.campus_id as string);
  if (!g.ok) return { ok: false, status: 404, erro: "Exigência não encontrada." };
  const { error } = await supabase.from("exigencia_antecipacao").delete().eq("id", id);
  if (error) return { ok: false, status: 500, erro: "Falha ao remover a exigência." };
  return { ok: true, data: { id } };
}

// ── CampusPolitica (1:1, upsert) ─────────────────────────────────────────────

export async function obterCampusPolitica(supabase: SupabaseClient, campusId: string): Promise<ResultadoAdmin> {
  const g = await campusNoEscopo(supabase, campusId);
  if (!g.ok) return g;
  const { data, error } = await supabase
    .from("campus_politica")
    .select("*")
    .eq("campus_id", campusId)
    .maybeSingle();
  if (error) return { ok: false, status: 500, erro: "Falha ao carregar a política." };
  return { ok: true, data: { politica: data ?? null, baseCurrency: g.data.baseCurrency } };
}

export async function salvarCampusPolitica(
  supabase: SupabaseClient,
  campusId: string,
  raw: Record<string, unknown>,
): Promise<ResultadoAdmin> {
  const g = await campusNoEscopo(supabase, campusId);
  if (!g.ok) return g;
  const val = validarEscolaCampusPolitica({ ...raw, escolaCampusId: campusId, moeda: g.data.baseCurrency });
  if (!val.ok) return erroValidacao(val.erros);
  const p = val.valor;
  const { error } = await supabase
    .from("campus_politica")
    .upsert(
      {
        campus_id: campusId,
        tenant_id: g.data.tenantId,
        intake_maximo_vendavel: p.intakeMaximoVendavel,
        prazo_pagamento_ancora: p.prazoPagamentoAncora,
        prazo_pagamento_unidade: p.prazoPagamentoUnidade,
        prazo_pagamento_valor: p.prazoPagamentoValor,
        reembolso_destinatario: p.reembolsoDestinatario,
        reembolso_prazo_dias: p.reembolsoPrazoDias,
        reembolso_forma: p.reembolsoForma,
        credito_validade_meses: p.creditoValidadeMeses,
        credito_transferivel: p.creditoTransferivel,
        credito_escopo: p.creditoEscopo,
        politica_fonte: p.politicaFonte,
        politica_url: p.politicaUrl,
        politica_snapshot_ref: p.politicaSnapshotRef,
        politica_versao: p.politicaVersao,
        politica_data: p.politicaData,
        protecao_estudantil: p.protecaoEstudantil,
        calendario_feriados_pais: p.calendarioFeriadosPais,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "campus_id" },
    );
  if (error) return { ok: false, status: 500, erro: "Falha ao salvar a política." };
  return { ok: true, data: { campusId } };
}

// Campi no escopo do admin (para o seletor da tela). Só id/nome/país/moeda.
export async function listarCamposDoEscopo(supabase: SupabaseClient): Promise<ResultadoAdmin> {
  const escopo = await escopoTenantAdmin(supabase);
  let q = supabase.from("campus").select("id, name, city, country_code, base_currency").order("name", { ascending: true });
  if (!escopo.global) q = q.eq("tenant_id", escopo.tenantId);
  const { data, error } = await q;
  if (error) return { ok: false, status: 500, erro: "Falha ao listar os campi." };
  return { ok: true, data: data ?? [] };
}
