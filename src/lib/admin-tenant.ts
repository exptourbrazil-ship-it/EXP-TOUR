// Escopo de TENANT do admin autenticado, para as rotas admin que recebem um
// contratoId/id cru (Anexo III e, futuramente, demais rotas de catalogo/contrato).
//
// Contexto: o banco Supabase e UNICO e compartilhado entre os tenants (EXP Tour e
// Forio); a autorizacao e feita EM CODIGO (RLS sem policies + service role). Uma
// rota admin que aceita um id sem conferir o tenant deixa um admin de um tenant
// ler/editar dados de outro. Este modulo centraliza a decisao "este admin pode
// agir sobre um contrato deste tenant?".
//
// Modelo (decisao registrada no fix): o tenant efetivo do admin e o do DEPLOY
// (CATALOGO_TENANT_SLUG -> tenantIdAtual), coerente com o deploy unico
// consolidado. A coluna admin_users.tenant_id atua como CHAVE do escopo: NULL =>
// admin GLOBAL (ve todos os tenants); qualquer valor => admin escopado ao tenant
// do deploy. No modelo de deploy unico o valor nao-NULL coincide com o tenant do
// deploy; se um dia houver mais de um tenant ativo por deploy, esta resolucao
// deve passar a usar o proprio admin_users.tenant_id.
//
// NB: SERVER-ONLY (usa a service role via chamador e le a sessao). Nunca importar
// em codigo client.
//
// `usuarioAdminAtual`/`tenantIdAtual` sao importados DINAMICAMENTE dentro das
// funcoes (nao no topo). Assim o helper puro `escopoPermiteContrato` pode ser
// coberto por `node --test` sem que o carregador tente resolver o alias "@/"
// (mesmo motivo do import dinamico em cron-tenant.ts).
import type { SupabaseClient } from "@supabase/supabase-js";
// Import de TIPO apenas (apagado em runtime): manter o modulo carregavel por
// `node --test` sem puxar next/server. As respostas 404 sao montadas com import
// dinamico em `naoEncontrado`.
import type { NextResponse } from "next/server";

// Escopo resolvido do admin: global (sem restricao) ou preso a um tenant.
export type EscopoAdmin = { global: true } | { global: false; tenantId: string };

/**
 * PURA (testavel sem rede/DB): um escopo de admin PODE agir sobre um contrato
 * cujo tenant e `contratoTenantId`? Global ve tudo. Escopado so ve o proprio
 * tenant — contrato de outro tenant OU sem tenant (NULL) e NEGADO. O chamador
 * traduz o "nao" em 404 (falha fechada: nao vaza a existencia do recurso).
 */
export function escopoPermiteContrato(
  escopo: EscopoAdmin,
  contratoTenantId: string | null,
): boolean {
  if (escopo.global) return true;
  return contratoTenantId != null && contratoTenantId === escopo.tenantId;
}

/**
 * Resolve o escopo do admin autenticado. Falha para o lado do comportamento
 * atual (global) quando nao ha como escopar — assim a migracao pode chegar antes
 * de os admins receberem tenant sem barrar ninguem:
 *  - sem e-mail de sessao (caminho Bearer de compatibilidade) => global;
 *  - admin sem linha / coluna tenant_id ainda ausente (erro no select) => global;
 *  - admin_users.tenant_id NULL => global (por definicao do modelo);
 *  - admin_users.tenant_id preenchido => escopado ao tenant do deploy.
 */
export async function escopoTenantAdmin(supabase: SupabaseClient): Promise<EscopoAdmin> {
  const { usuarioAdminAtual } = await import("@/lib/admin-guard");
  const email = await usuarioAdminAtual();
  // Caminho Bearer de compatibilidade (checarCapacidadeRequest aceita o segredo
  // ADMIN_CAMBIO_SECRET): sem e-mail de sessao => SUPER-ADMIN GLOBAL. So e seguro
  // porque esse segredo e uma credencial de NIVEL-GRUPO; nunca entregue o Bearer
  // a uma automacao que deva ficar presa a um unico tenant.
  if (!email) return { global: true };

  const { data, error } = await supabase
    .from("admin_users")
    .select("tenant_id")
    .eq("email", email.toLowerCase())
    .maybeSingle();
  if (error) {
    // Falha FECHADA por padrao. Excecao unica: a coluna/tabela ainda nao existe
    // (migracao pendente) => volta ao comportamento atual (global) para nao barrar
    // ninguem na janela de migracao. Erro transitorio NAO vira global (senao uma
    // falha momentanea abriria acesso cross-tenant).
    const code = (error as { code?: string }).code;
    if (code === "42703" || code === "42P01") return { global: true }; // undefined_column / undefined_table
    throw new Error(`Falha ao resolver o escopo do admin: ${error.message}`);
  }
  // Sem linha para o e-mail da sessao (anomalo: o login exige admin_users ativo)
  // ou tenant_id NULL => admin GLOBAL por definicao do modelo.
  const tid = data ? ((data as { tenant_id?: string | null }).tenant_id ?? null) : null;
  if (tid == null) return { global: true };

  // Admin escopado: o tenant efetivo e o do DEPLOY (decisao registrada). Guarda
  // contra footgun em banco compartilhado: se o tenant gravado no admin diverge
  // do tenant do deploy, e misconfiguracao => falha FECHADA (500), nunca escopa em
  // silencio para o deploy. (Se um dia o deploy servir mais de um tenant, esta
  // resolucao deve passar a usar o proprio admin_users.tenant_id.)
  const { tenantIdAtual } = await import("@/lib/catalog-service");
  const deployTenant = await tenantIdAtual(supabase);
  if (tid !== deployTenant) {
    throw new Error(
      "Escopo de admin inconsistente: admin_users.tenant_id difere do tenant do deploy (CATALOGO_TENANT_SLUG).",
    );
  }
  return { global: false, tenantId: deployTenant };
}

/**
 * Tenant de um contrato. Prefere a coluna direta contratos.tenant_id; se NULL
 * (contrato ainda nao backfillado ou criado sem gravar o tenant), deriva do
 * titular — assim o escopo continua correto mesmo antes de a denormalizacao
 * estar 100%. `existe: false` quando o contrato nao existe.
 */
export async function tenantDoContrato(
  supabase: SupabaseClient,
  contratoId: string,
): Promise<{ existe: boolean; tenantId: string | null }> {
  const { data, error } = await supabase
    .from("contratos")
    .select("tenant_id, titular_id")
    .eq("id", contratoId)
    .maybeSingle();
  if (error) throw new Error(`Falha ao resolver o tenant do contrato: ${error.message}`);
  if (!data) return { existe: false, tenantId: null };

  const row = data as { tenant_id?: string | null; titular_id?: string | null };
  let tenantId = row.tenant_id ?? null;
  if (tenantId == null && row.titular_id) {
    const { data: t } = await supabase
      .from("titulares")
      .select("tenant_id")
      .eq("id", row.titular_id)
      .maybeSingle();
    tenantId = (t as { tenant_id?: string | null } | null)?.tenant_id ?? null;
  }
  return { existe: true, tenantId };
}

/**
 * Tenant de um TITULAR (dono do Caso 360). Prefere a coluna direta
 * titulares.tenant_id; se NULL, deriva do contrato mais recente do titular
 * (mesma lógica de fallback de tenantDoContrato). `existe: false` quando o
 * titular não existe.
 */
export async function tenantDoTitular(
  supabase: SupabaseClient,
  titularId: string,
): Promise<{ existe: boolean; tenantId: string | null }> {
  const { data, error } = await supabase
    .from("titulares")
    .select("tenant_id")
    .eq("id", titularId)
    .maybeSingle();
  if (error) throw new Error(`Falha ao resolver o tenant do titular: ${error.message}`);
  if (!data) return { existe: false, tenantId: null };

  let tenantId = (data as { tenant_id?: string | null }).tenant_id ?? null;
  if (tenantId == null) {
    // Fallback: deriva do contrato mais recente (titular ainda não backfillado).
    const { data: c } = await supabase
      .from("contratos")
      .select("tenant_id")
      .eq("titular_id", titularId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    tenantId = (c as { tenant_id?: string | null } | null)?.tenant_id ?? null;
  }
  return { existe: true, tenantId };
}

/**
 * Ids dos contratos visiveis a um escopo, para as LISTAGENS (GET sem contratoId).
 * Global => null (o chamador NAO filtra: ve todos). Escopado => os contratos do
 * tenant (via contratos.tenant_id, ja backfillado). Pode ser [] (tenant sem
 * contratos) — nesse caso a listagem volta vazia.
 */
export async function contratoIdsDoEscopo(
  supabase: SupabaseClient,
  escopo: EscopoAdmin,
): Promise<string[] | null> {
  if (escopo.global) return null;
  const { data, error } = await supabase
    .from("contratos")
    .select("id")
    .eq("tenant_id", escopo.tenantId);
  if (error) throw new Error(`Falha ao listar contratos do tenant: ${error.message}`);
  return (data ?? []).map((r) => (r as { id: string }).id);
}

/**
 * Conveniencia: resolve o escopo do admin atual e devolve os ids de contrato
 * visiveis (null = global; array = escopado, possivelmente vazio). Para paineis
 * agregados (financeiro) que filtram por contrato.
 */
export async function contratoIdsDoEscopoAtual(
  supabase: SupabaseClient,
): Promise<string[] | null> {
  const escopo = await escopoTenantAdmin(supabase);
  return contratoIdsDoEscopo(supabase, escopo);
}

/**
 * Ids dos titulares visiveis a um escopo, para as LISTAGENS. Global => null (nao
 * filtra). Escopado => titulares do tenant. Pode ser [] (tenant sem titulares).
 */
export async function titularIdsDoEscopo(
  supabase: SupabaseClient,
  escopo: EscopoAdmin,
): Promise<string[] | null> {
  if (escopo.global) return null;
  const { data, error } = await supabase
    .from("titulares")
    .select("id")
    .eq("tenant_id", escopo.tenantId);
  if (error) throw new Error(`Falha ao listar titulares do tenant: ${error.message}`);
  return (data ?? []).map((r) => (r as { id: string }).id);
}

// Tenant de um titular. `existe: false` quando o titular nao existe.
async function tenantDoTitularId(
  supabase: SupabaseClient,
  titularId: string,
): Promise<{ existe: boolean; tenantId: string | null }> {
  const { data, error } = await supabase
    .from("titulares")
    .select("tenant_id")
    .eq("id", titularId)
    .maybeSingle();
  if (error) throw new Error(`Falha ao resolver o tenant do titular: ${error.message}`);
  if (!data) return { existe: false, tenantId: null };
  return { existe: true, tenantId: (data as { tenant_id?: string | null }).tenant_id ?? null };
}

// ---------------------------------------------------------------------------
// GUARDAS DE ROTA. Padrao unico para todas as rotas admin que recebem um id de
// entidade: resolvem o tenant da entidade e devolvem uma resposta 404 PRONTA
// quando o admin escopado nao pode agir sobre ela; ou `null` para prosseguir.
// Admin GLOBAL sempre passa (retorna null). O 404 e identico para "inexistente"
// e "de outro tenant" — nao vaza existencia. Chame LOGO APOS o params/id, antes
// de qualquer efeito (leitura sensivel, 409 de imutabilidade, mutacao).
// ---------------------------------------------------------------------------

// 404 padrao (import dinamico de next/server: ver nota do import de tipo acima).
async function naoEncontrado(): Promise<NextResponse> {
  const { NextResponse } = await import("next/server");
  return NextResponse.json({ ok: false, erro: "Recurso nao encontrado." }, { status: 404 });
}

// Nucleo: dado se a entidade existe e qual o seu tenant, decide 404 x prosseguir.
async function barrar(
  supabase: SupabaseClient,
  existe: boolean,
  tenantIdDaEntidade: string | null,
): Promise<NextResponse | null> {
  const escopo = await escopoTenantAdmin(supabase);
  if (escopo.global) return null;
  if (!existe || !escopoPermiteContrato(escopo, tenantIdDaEntidade)) return naoEncontrado();
  return null;
}

/** Barra se o CONTRATO nao esta no escopo do admin. */
export async function barrarContratoForaDoEscopo(
  supabase: SupabaseClient,
  contratoId: string,
): Promise<NextResponse | null> {
  const { existe, tenantId } = await tenantDoContrato(supabase, contratoId);
  return barrar(supabase, existe, tenantId);
}

/** Barra se o TITULAR (cliente) nao esta no escopo do admin. */
export async function barrarTitularForaDoEscopo(
  supabase: SupabaseClient,
  titularId: string,
): Promise<NextResponse | null> {
  const { existe, tenantId } = await tenantDoTitularId(supabase, titularId);
  return barrar(supabase, existe, tenantId);
}

// Resolve {existe, tenantId} de uma entidade que aponta para um contrato pela
// coluna informada (default "contrato_id"): o tenant vem do contrato.
async function tenantViaContrato(
  supabase: SupabaseClient,
  tabela: string,
  id: string,
  coluna = "contrato_id",
): Promise<{ existe: boolean; tenantId: string | null }> {
  const { data, error } = await supabase.from(tabela).select(coluna).eq("id", id).maybeSingle();
  if (error) throw new Error(`Falha ao resolver o tenant de ${tabela}: ${error.message}`);
  if (!data) return { existe: false, tenantId: null };
  const cid = (data as unknown as Record<string, string | null>)[coluna];
  if (!cid) return { existe: true, tenantId: null };
  const c = await tenantDoContrato(supabase, cid);
  return { existe: true, tenantId: c.tenantId };
}

// Resolve {existe, tenantId} de uma entidade que aponta para um titular.
async function tenantViaTitular(
  supabase: SupabaseClient,
  tabela: string,
  id: string,
  coluna = "titular_id",
): Promise<{ existe: boolean; tenantId: string | null }> {
  const { data, error } = await supabase.from(tabela).select(coluna).eq("id", id).maybeSingle();
  if (error) throw new Error(`Falha ao resolver o tenant de ${tabela}: ${error.message}`);
  if (!data) return { existe: false, tenantId: null };
  const tid = (data as unknown as Record<string, string | null>)[coluna];
  if (!tid) return { existe: true, tenantId: null };
  const t = await tenantDoTitularId(supabase, tid);
  return { existe: true, tenantId: t.tenantId };
}

/** Barra se a PARCELA (via contrato) nao esta no escopo. */
export async function barrarParcelaForaDoEscopo(
  supabase: SupabaseClient,
  parcelaId: string,
): Promise<NextResponse | null> {
  const { existe, tenantId } = await tenantViaContrato(supabase, "parcelas", parcelaId);
  return barrar(supabase, existe, tenantId);
}

/** Barra se a REPACTUACAO (via contrato) nao esta no escopo. */
export async function barrarRepactuacaoForaDoEscopo(
  supabase: SupabaseClient,
  repactuacaoId: string,
): Promise<NextResponse | null> {
  const { existe, tenantId } = await tenantViaContrato(supabase, "repactuacoes", repactuacaoId);
  return barrar(supabase, existe, tenantId);
}

/** Barra se a ANTECIPACAO (via contrato) nao esta no escopo. */
export async function barrarAntecipacaoForaDoEscopo(
  supabase: SupabaseClient,
  antecipacaoId: string,
): Promise<NextResponse | null> {
  const { existe, tenantId } = await tenantViaContrato(supabase, "antecipacoes", antecipacaoId);
  return barrar(supabase, existe, tenantId);
}

/** Barra se a EXCECAO (via titular) nao esta no escopo. */
export async function barrarExcecaoForaDoEscopo(
  supabase: SupabaseClient,
  excecaoId: string,
): Promise<NextResponse | null> {
  const { existe, tenantId } = await tenantViaTitular(supabase, "case_exceptions", excecaoId);
  return barrar(supabase, existe, tenantId);
}

/** Barra se o DOCUMENTO (via titular) nao esta no escopo. */
export async function barrarDocumentoForaDoEscopo(
  supabase: SupabaseClient,
  documentoId: string,
): Promise<NextResponse | null> {
  const { existe, tenantId } = await tenantViaTitular(supabase, "documentos", documentoId);
  return barrar(supabase, existe, tenantId);
}

// Resolve {existe, tenantId} de uma entidade com coluna tenant_id DIRETA.
async function tenantDireto(
  supabase: SupabaseClient,
  tabela: string,
  id: string,
): Promise<{ existe: boolean; tenantId: string | null }> {
  const { data, error } = await supabase.from(tabela).select("tenant_id").eq("id", id).maybeSingle();
  if (error) throw new Error(`Falha ao resolver o tenant de ${tabela}: ${error.message}`);
  if (!data) return { existe: false, tenantId: null };
  return { existe: true, tenantId: (data as { tenant_id?: string | null }).tenant_id ?? null };
}

/** Barra se o LEAD (lead.tenant_id direto) nao esta no escopo. */
export async function barrarLeadForaDoEscopo(
  supabase: SupabaseClient,
  leadId: string,
): Promise<NextResponse | null> {
  const { existe, tenantId } = await tenantDireto(supabase, "lead", leadId);
  return barrar(supabase, existe, tenantId);
}

/** Barra se a PROPOSTA (propostas.tenant_id direto) nao esta no escopo. */
export async function barrarPropostaForaDoEscopo(
  supabase: SupabaseClient,
  propostaId: string,
): Promise<NextResponse | null> {
  const { existe, tenantId } = await tenantDireto(supabase, "propostas", propostaId);
  return barrar(supabase, existe, tenantId);
}

/** Barra se o FORNECEDOR (supplier.tenant_id direto) nao esta no escopo. */
export async function barrarSupplierForaDoEscopo(
  supabase: SupabaseClient,
  supplierId: string,
): Promise<NextResponse | null> {
  const { existe, tenantId } = await tenantDireto(supabase, "supplier", supplierId);
  return barrar(supabase, existe, tenantId);
}

/** Barra se o USUARIO DE FORNECEDOR (supplier_user.tenant_id direto) nao esta no escopo. */
export async function barrarSupplierUserForaDoEscopo(
  supabase: SupabaseClient,
  supplierUserId: string,
): Promise<NextResponse | null> {
  const { existe, tenantId } = await tenantDireto(supabase, "supplier_user", supplierUserId);
  return barrar(supabase, existe, tenantId);
}
