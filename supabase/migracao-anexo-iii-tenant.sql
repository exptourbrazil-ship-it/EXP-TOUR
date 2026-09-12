-- Isolamento por tenant nas rotas admin do Anexo III (e base para as demais
-- rotas admin de catalogo/contrato). O banco Supabase e UNICO e compartilhado
-- entre os tenants (EXP Tour e Forio); a autorizacao e feita EM CODIGO (RLS sem
-- policies + service role). Sem este escopo, um admin de um tenant conseguia
-- ler/emitir/editar o Anexo III de contratos de outro tenant.
--
-- Idempotente. Aplicar no SQL Editor do Supabase (migracoes de producao via MCP
-- sao bloqueadas). schema.sql tambem reflete estas colunas (fora do bloco CREATE
-- de proposito: o guardrail de tenant-isolation.test.ts deriva as tabelas
-- "tenant-scoped" dos blocos CREATE, e admin_users/contratos sao consultadas por
-- chave unica — e-mail / id / via titular — nao por varredura por tenant).

-- 1) Tenant do ADMIN. NULL = admin GLOBAL: enxerga todos os tenants (super-admin
--    do grupo). Os admins existentes ficam NULL => comportamento atual preservado
--    (ninguem e barrado). O corte entre tenants passa a valer quando um admin
--    recebe um tenant_id != NULL (a partir dai ele so ve o proprio tenant).
alter table if exists admin_users
  add column if not exists tenant_id uuid references tenant(id);
create index if not exists idx_admin_users_tenant on admin_users(tenant_id);

-- 2) Tenant do CONTRATO (coluna direta). Ate aqui o tenant do contrato era
--    derivado de titulares.tenant_id (contratos nao tinha coluna propria); a
--    coluna direta simplifica o escopo por tenant nas rotas admin. NULL segue a
--    mesma convencao de titulares: tenant legado (EXP Tour). Backfill a partir do
--    titular; contratos NOVOS devem gravar tenant_id no insert (ver observacao na
--    rota de provisionamento) — enquanto isso o codigo faz fallback para o
--    titular quando a coluna estiver NULL.
alter table if exists contratos
  add column if not exists tenant_id uuid references tenant(id);

update contratos c
   set tenant_id = t.tenant_id
  from titulares t
 where c.titular_id = t.id
   and c.tenant_id is distinct from t.tenant_id;

create index if not exists idx_contratos_tenant on contratos(tenant_id);

-- OPERACIONAL (evitar lock-out): so atribua um tenant_id != NULL a um admin
-- DEPOIS que os contratos/titulares daquele tenant carregarem tenant_id != NULL.
-- Um admin escopado NAO ve contratos com tenant NULL (legado) — se os dados do
-- tenant ainda estiverem NULL, o admin escopado ficaria com listagens vazias /
-- 404 no proprio tenant. Sequencia segura: (1) backfill dos dados do tenant;
-- (2) so entao escopar os admins desse tenant. Admins do tenant legado (EXP Tour)
-- cujos dados permanecem NULL devem seguir GLOBAIS (tenant_id = NULL).
