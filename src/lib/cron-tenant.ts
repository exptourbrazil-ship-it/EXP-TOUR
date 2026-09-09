// Escopo de TENANT para os crons (server-only).
//
// Contexto (ver docs/deploy-multi-tenant.md): o portal opera EXP Tour e Forio
// como DOIS deploys (uma URL cada) sobre o MESMO banco Supabase. O tenant do
// deploy vem de CATALOGO_TENANT_SLUG (resolvido por tenantIdAtual). O Vercel
// Cron roda o MESMO vercel.json nos dois deploys, entao cada cron precisa
// processar APENAS o tenant do seu deploy — senao os dois processam em
// duplicidade (e-mails/alertas duplicados; efeitos de dinheiro sao idempotentes
// pelo ledger `events`, mas o resto nao).
//
// Padrao (o mesmo de regua-cobranca/conferir-faturas e de produto-admin-service):
// resolve o tenant do deploy e filtra as consultas por tenant_id. As tabelas da
// Area do Cliente (contratos, parcelas, documentos, case_exceptions, acertos,
// estornos, tasks) NAO tem tenant_id direto — escopam pela entidade que tem
// (titular.tenant_id). Este modulo centraliza a resolucao dos conjuntos de ids
// (titulares/contratos/fornecedores) do tenant para os crons filtrarem com .in().
//
// NB: usa a service role; nunca importar em codigo client.
import type { SupabaseClient } from "@supabase/supabase-js";
import { tenantIdAtual } from "@/lib/catalog-service";

// Slug do tenant "legado": os registros da Area do Cliente anteriores ao
// multi-tenant tem titulares.tenant_id = NULL e pertencem, por convencao, a este
// tenant (ver schema.sql em titulares: "NULL -> padrao EXP Tour"). O deploy
// desse tenant tambem e dono desses registros legados; os demais deploys, nao.
// Configuravel por env para nao ficar preso ao slug "exp-tour".
const SLUG_TENANT_LEGADO = process.env.TENANT_LEGADO_SLUG ?? "exp-tour";

export type EscopoTenant = {
  tenantId: string;
  slug: string;
  // true quando este deploy tambem e dono dos registros legados (tenant_id NULL).
  incluiLegado: boolean;
};

/**
 * Decide se o deploy do slug informado e dono dos registros legados (tenant_id
 * NULL). Pura (testavel) — a regra de negocio fica separada da consulta ao banco.
 */
export function deployEhLegado(slug: string, legadoSlug: string = SLUG_TENANT_LEGADO): boolean {
  return slug === legadoSlug;
}

/**
 * Quebra um array em pedacos de tamanho fixo — usado para nao estourar o
 * comprimento da URL nos filtros .in() do PostgREST quando a lista de ids cresce.
 * Pura (testavel).
 */
export function emLotes<T>(itens: T[], tamanho: number): T[][] {
  if (tamanho <= 0) throw new Error("tamanho do lote deve ser > 0");
  const out: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) out.push(itens.slice(i, i + tamanho));
  return out;
}

// Teto de ids por filtro .in() (defensivo contra URL longa). O volume atual da
// Area do Cliente e modesto (centenas de contratos), entao um lote basta na
// pratica; o loteamento existe para nao quebrar se o volume crescer.
const LOTE_IN = 500;

/**
 * Resolve o escopo do tenant do deploy: id, slug e se e o dono dos registros
 * legados. Reusa tenantIdAtual (mesma fonte: CATALOGO_TENANT_SLUG).
 */
export async function resolverEscopoTenant(supabase: SupabaseClient): Promise<EscopoTenant> {
  // Falha FECHADA: diferente do resto do app (que cai no default 'forio' para
  // tematizacao), aqui a ausencia de CATALOGO_TENANT_SLUG e recusada. Se o deploy
  // EXP Tour esquecesse a env, cair em 'forio' processaria o Forio em duplicidade
  // E, pior, nenhum deploy seria o legado — os orfaos de alertar-eventos e as
  // tasks orfas de materializar-tasks deixariam de ser tratados (falha silenciosa).
  const slug = (process.env.CATALOGO_TENANT_SLUG ?? "").trim();
  if (!slug) {
    throw new Error(
      "CATALOGO_TENANT_SLUG ausente: cron multi-tenant recusado (configure o slug do tenant do deploy).",
    );
  }
  const tenantId = await tenantIdAtual(supabase);
  return { tenantId, slug, incluiLegado: deployEhLegado(slug) };
}

/**
 * Ids dos titulares deste tenant. Inclui os titulares legados (tenant_id NULL)
 * quando este e o deploy do tenant legado. Pode retornar [] (tenant sem titulares
 * — ex.: Forio no inicio); nesse caso os crons nao processam nada da Area do
 * Cliente, que e o comportamento desejado.
 */
export async function titularIdsDoTenant(
  supabase: SupabaseClient,
  escopo: EscopoTenant,
): Promise<string[]> {
  const ids = new Set<string>();

  const { data, error } = await supabase
    .from("titulares")
    .select("id")
    .eq("tenant_id", escopo.tenantId);
  if (error) throw new Error(`Falha ao carregar titulares do tenant: ${error.message}`);
  for (const r of data ?? []) ids.add((r as { id: string }).id);

  if (escopo.incluiLegado) {
    const { data: legado, error: erroLegado } = await supabase
      .from("titulares")
      .select("id")
      .is("tenant_id", null);
    if (erroLegado) throw new Error(`Falha ao carregar titulares legados: ${erroLegado.message}`);
    for (const r of legado ?? []) ids.add((r as { id: string }).id);
  }

  return [...ids];
}

/**
 * Ids dos contratos deste tenant (via titular.tenant_id). Aceita titularIds ja
 * resolvidos para evitar reconsulta. Retorna [] quando o tenant nao tem titulares
 * ou contratos.
 */
export async function contratoIdsDoTenant(
  supabase: SupabaseClient,
  escopo: EscopoTenant,
  titularIds?: string[],
): Promise<string[]> {
  const titIds = titularIds ?? (await titularIdsDoTenant(supabase, escopo));
  if (titIds.length === 0) return [];

  const ids: string[] = [];
  for (const lote of emLotes(titIds, LOTE_IN)) {
    const { data, error } = await supabase
      .from("contratos")
      .select("id")
      .in("titular_id", lote);
    if (error) throw new Error(`Falha ao carregar contratos do tenant: ${error.message}`);
    for (const r of data ?? []) ids.push((r as { id: string }).id);
  }
  return ids;
}

/**
 * Ids dos fornecedores (supplier) deste tenant. supplier.tenant_id e direto. Usado
 * pelos crons do Portal do Fornecedor, cujo tenant e o do FORNECEDOR (nao o do
 * titular). Retorna [] quando o tenant nao tem fornecedores.
 */
export async function supplierIdsDoTenant(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("supplier")
    .select("id")
    .eq("tenant_id", tenantId);
  if (error) throw new Error(`Falha ao carregar fornecedores do tenant: ${error.message}`);
  return (data ?? []).map((r) => (r as { id: string }).id);
}

/**
 * Conjuntos de posse do tenant (titulares, contratos, fornecedores) para os crons
 * que tocam varias entidades da Area do Cliente ao mesmo tempo (materializar-tasks,
 * alertar-eventos). Resolve uma vez e reusa.
 */
export type MembershipTenant = {
  tenantId: string;
  titularIds: string[];
  contratoIds: string[];
  supplierIds: string[];
};

export async function membershipDoTenant(
  supabase: SupabaseClient,
  escopo: EscopoTenant,
): Promise<MembershipTenant> {
  const titularIds = await titularIdsDoTenant(supabase, escopo);
  const contratoIds = await contratoIdsDoTenant(supabase, escopo, titularIds);
  const supplierIds = await supplierIdsDoTenant(supabase, escopo.tenantId);
  return { tenantId: escopo.tenantId, titularIds, contratoIds, supplierIds };
}
