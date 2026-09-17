-- F3.4 — DISPONIBILIDADE lida por IA -> proposta PENDENTE (availability_submission).
-- Aplicada em producao em 2026-09-16 (MCP apply_migration). Idempotente.
-- Uma linha por leitura de material: `extracted` = o que a IA leu; `plano` = itens
-- (criar/alterar/igual) ja casados com os produtos e comparados ao publicado;
-- `avisos` = auditoria da IA. So aprovarPropostaDisponibilidade grava
-- product_availability / accommodation_availability (via salvarIntake/salvarPeriodo,
-- upsert idempotente + trilha). 'processing' = trava atomica durante a publicacao.
begin;

create table if not exists availability_submission (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id),
  supplier_id uuid not null references supplier(id) on delete cascade,
  source_material_id uuid references material(id) on delete set null,
  source_filename text,
  extracted jsonb not null default '{}'::jsonb,
  plano jsonb not null default '{}'::jsonb,
  avisos jsonb not null default '[]'::jsonb,
  status text not null default 'pending_admin'
    check (status in ('pending_admin','processing','approved','rejected')),
  aplicacao jsonb, -- resumo do que foi publicado na aprovacao
  created_by text, submitted_by text,
  admin_approved_by text, admin_approved_at timestamptz,
  rejected_by text, rejected_at timestamptz, reject_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create index if not exists availability_submission_tenant_status_idx on availability_submission(tenant_id, status);
create index if not exists availability_submission_material_idx on availability_submission(source_material_id);
alter table if exists availability_submission enable row level security;

-- Novo tipo de material: 'calendario' (datas de inicio), legivel por IA (PDF ou imagem).
alter table material drop constraint if exists material_tipo_check;
alter table material add constraint material_tipo_check
  check (tipo in ('brochura','price_list','promocao','calendario','foto','video','apresentacao','midia_kit','logotipo','termos','outro'));

commit;
