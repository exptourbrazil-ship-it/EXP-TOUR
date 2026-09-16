-- Material com APROVAÇÃO (F2 do módulo Fornecedores): fornecedor sobe → 'pendente'
-- → admin publica ('aprovado') ou recusa ('rejeitado' + motivo); admin sobe → já
-- 'aprovado'. Só material APROVADO alcança cliente/cotação. Default 'aprovado' =
-- os materiais existentes (já ao vivo) permanecem publicados sem backfill
-- explícito. Aditiva e idempotente. Aplicada em produção em 16/09/2026.
alter table if exists material add column if not exists status text not null default 'aprovado';
alter table if exists material add column if not exists submitted_by text;
alter table if exists material add column if not exists aprovado_por text;
alter table if exists material add column if not exists aprovado_em timestamptz;
alter table if exists material add column if not exists rejeitado_por text;
alter table if exists material add column if not exists rejeitado_em timestamptz;
alter table if exists material add column if not exists motivo_rejeicao text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'material_status_check') then
    alter table material add constraint material_status_check check (status in ('pendente','aprovado','rejeitado'));
  end if;
end $$;
create index if not exists idx_material_tenant_status on material(tenant_id, status, archived_at);
-- Teto do motivo da recusa também no banco (a rota já limita a 1000; fecha a porta
-- para qualquer writer futuro). Aplicado em produção em 16/09/2026.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'material_motivo_rejeicao_len') then
    alter table material add constraint material_motivo_rejeicao_len
      check (motivo_rejeicao is null or length(motivo_rejeicao) <= 1000);
  end if;
end $$;
