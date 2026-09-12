-- Fase B2 — captura de CONTEÚDO DE ESCOLA (campus) pelo fornecedor
-- ("propõe → admin aprova"). Colunas novas em campus para os blocos do Edvisor
-- que ainda não tinham lugar, + staging análogo a content_submission.

-- Amenities / acreditações (listas de rótulos) e nationality mix (array jsonb de
-- { pais, percentual }). Language-neutral no campus.
alter table if exists campus add column if not exists amenities text[] not null default '{}';
alter table if exists campus add column if not exists accreditations text[] not null default '{}';
alter table if exists campus add column if not exists nationality_mix jsonb not null default '[]';

-- Staging do conteúdo de escola (payload: content por locale + media + amenities
-- + accreditations + nationalityMix). Uma submissão aberta por campus.
create table if not exists campus_content_submission (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id),
  supplier_id uuid not null references supplier(id) on delete cascade,
  campus_id uuid not null references campus(id) on delete cascade,
  payload jsonb not null default '{}',
  status text not null default 'draft'
    check (status in ('draft','pending_admin','approved','rejected')),
  created_by text, submitted_by text, supplier_approved_at timestamptz,
  admin_approved_by text, admin_approved_at timestamptz,
  rejected_by text, rejected_at timestamptz, reject_reason text,
  created_at timestamptz not null default now(), updated_at timestamptz
);
create index if not exists idx_campus_content_sub_supplier on campus_content_submission(supplier_id, status);
create index if not exists idx_campus_content_sub_status on campus_content_submission(tenant_id, status);
create index if not exists idx_campus_content_sub_campus on campus_content_submission(campus_id);
create unique index if not exists uq_campus_content_sub_aberta
  on campus_content_submission(campus_id) where status in ('draft','pending_admin');
alter table if exists campus_content_submission enable row level security;
