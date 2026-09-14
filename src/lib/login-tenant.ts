// Escopo de TENANT para as rotas de LOGIN (cliente + fornecedor). Módulo PURO.
//
// Contexto (ver docs/deploy-multi-tenant.md): o portal opera EXP Tour e Forio
// como DOIS deploys (uma URL cada) sobre o MESMO banco Supabase. O tenant do
// deploy vem de CATALOGO_TENANT_SLUG. O login é a porta de entrada: sem escopo,
// um titular/fornecedor de um tenant conseguiria pedir código e abrir sessão na
// URL do outro tenant (mesmo banco). O gate faz cada deploy autenticar APENAS
// quem pertence ao seu tenant.
//
// A REGRA de "a que tenant o deploy pertence" (id + dono do legado) já existe em
// cron-tenant.resolverEscopoTenant, que falha FECHADO se CATALOGO_TENANT_SLUG
// faltar. As rotas de login reusam aquele resolvedor e aplicam a decisão pura
// abaixo. Este arquivo fica sem import de runtime (leaf puro) para ser coberto
// pelo runner nativo do Node sem resolver aliases de path.

/**
 * Um registro (pelo seu tenant_id) pertence ao deploy atual?
 *
 * - tenant_id == tenant do deploy  -> sim.
 * - tenant_id NULL (legado)        -> sim SÓ se este deploy é o dono do legado
 *   (titulares pré-multi-tenant têm tenant_id NULL; por convenção pertencem ao
 *   tenant legado — ver docs/deploy-multi-tenant.md).
 * - caso contrário                 -> não.
 *
 * supplier/supplier_user.tenant_id é NOT NULL no schema, então o ramo legado só
 * afeta titulares; para fornecedor `incluiLegado` é inócuo (tenant_id nunca é
 * nulo).
 */
export function tenantPertenceAoDeploy(
  recordTenantId: string | null | undefined,
  deployTenantId: string,
  incluiLegado: boolean,
): boolean {
  if (recordTenantId == null) return incluiLegado;
  return recordTenantId === deployTenantId;
}
