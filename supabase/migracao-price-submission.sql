-- price_submission — bloco da "Fase C" que existia SÓ no schema.sql (~L2611-2660) e
-- NUNCA tinha sido aplicado em produção (descoberto em 16/09/2026 ao aplicar a F3.1:
-- "relation price_submission does not exist"). Sem ele, o upload de price list no
-- portal do fornecedor (api/fornecedor/price-list) falharia no insert, e a
-- materialização/supersede por source_submission_id não tinha coluna.
-- Idêntico ao schema.sql. Aditivo e idempotente. Aplicado em produção em 16/09/2026
-- (na mesma transação da migracao-material-leitura-ia.sql).
create table if not exists price_submission (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id),
  supplier_id uuid not null references supplier(id) on delete cascade,
  campus_id uuid references campus(id) on delete set null,
  -- PDF de origem no bucket privado documentos-fornecedor (nao e doc de titular).
  source_storage_path text,
  source_filename text,
  currency char(3),
  -- Rascunho normalizado extraido do PDF (cursos/faixas/taxas), editavel pela escola.
  extracted jsonb not null default '{}'::jsonb,
  -- 'processing' = trava atomica durante a materializacao.
  status text not null default 'draft'
    check (status in ('draft','pending_admin','processing','approved','rejected')),
  extract_status text, -- 'ok' | 'sem_ia' | 'erro'
  created_by text,
  submitted_by text, supplier_approved_at timestamptz,
  admin_approved_by text, admin_approved_at timestamptz,
  rejected_by text, rejected_at timestamptz, reject_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create index if not exists idx_price_submission_supplier on price_submission(supplier_id, status);
create index if not exists idx_price_submission_status on price_submission(tenant_id, status);
alter table if exists price_submission enable row level security;

-- Versionamento da materializacao: linhas de catalogo geradas por um price list
-- aprovado carregam o submission de origem (supersede do anterior do mesmo campus).
alter table if exists product        add column if not exists source_submission_id uuid references price_submission(id);
alter table if exists price_template add column if not exists source_submission_id uuid references price_submission(id);
alter table if exists fee            add column if not exists source_submission_id uuid references price_submission(id);
create index if not exists idx_product_source_submission on product(source_submission_id);
create index if not exists idx_price_template_source_submission on price_template(source_submission_id);
create index if not exists idx_fee_source_submission on fee(source_submission_id);

alter table if exists price_submission drop constraint if exists price_submission_status_check;
alter table if exists price_submission add constraint price_submission_status_check
  check (status in ('draft','pending_admin','processing','approved','rejected'));
