-- Fase B1 — captura de CONTEÚDO DE PROGRAMA pelo fornecedor ("propõe → admin
-- aprova"). Staging análogo a price_submission: o fornecedor edita um rascunho
-- (payload jsonb) por produto; ao aprovar, vira pending_admin; o admin aprova e
-- a materialização copia para product_content / product_media / program_detail.
create table if not exists content_submission (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id),
  supplier_id uuid not null references supplier(id) on delete cascade,
  product_id uuid not null references product(id) on delete cascade,
  kind text not null default 'program',
  payload jsonb not null default '{}',
  status text not null default 'draft'
    check (status in ('draft','pending_admin','approved','rejected')),
  created_by text, submitted_by text, supplier_approved_at timestamptz,
  admin_approved_by text, admin_approved_at timestamptz,
  rejected_by text, rejected_at timestamptz, reject_reason text,
  created_at timestamptz not null default now(), updated_at timestamptz
);
create index if not exists idx_content_submission_supplier on content_submission(supplier_id, status);
create index if not exists idx_content_submission_status on content_submission(tenant_id, status);
create index if not exists idx_content_submission_product on content_submission(product_id);
-- No máximo UM rascunho/pendente por produto (o admin pode ter vários históricos).
create unique index if not exists uq_content_submission_aberta
  on content_submission(product_id) where status in ('draft','pending_admin');
alter table if exists content_submission enable row level security;
