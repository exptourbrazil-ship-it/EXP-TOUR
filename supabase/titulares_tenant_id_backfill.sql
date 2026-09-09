-- Backfill de titulares.tenant_id + NOT NULL.
--
-- Contexto: ao operar EXP Tour e Forio como dois deploys (uma URL cada) sobre o
-- MESMO banco, o login passou a escopar por tenant (.eq("tenant_id", ...) em
-- request-code/verify-code). Titulares legados ainda têm tenant_id NULL — que o
-- schema já define como "padrão EXP Tour" — e o filtro por igualdade NUNCA casa
-- com NULL. Sem este backfill, todo titular NULL ficaria TRANCADO fora do login
-- (silencioso no request-code, 401 no verify-code).
--
-- Idempotente e seguro: só toca linhas NULL; se o tenant 'exp-tour' não existir,
-- o UPDATE não altera nada e o ALTER ... SET NOT NULL falha de propósito (em vez
-- de gravar NULL), sinalizando a configuração faltante. Rode ANTES de subir o
-- código de escopo por tenant.

begin;

-- 1) Legado (tenant_id NULL) é da EXP Tour (default histórico do schema).
update titulares
set tenant_id = (select id from tenant where slug = 'exp-tour')
where tenant_id is null;

-- 2) Agora a coluna é obrigatória: NULL travaria o login escopado por tenant.
alter table titulares alter column tenant_id set not null;

commit;
