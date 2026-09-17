-- F3.3 — PROMOCAO lida por IA -> proposta PENDENTE (promotion_submission).
-- Aplicada em producao em 2026-09-16 (MCP apply_migration). Idempotente.
-- Uma linha por promocao extraida de um material (flyer 'promocao', price list ou
-- brochura). `extracted` = o que a IA leu; `entrada` = proposta no formato de
-- validarPromocao, editavel pelo admin na revisao; `avisos` = auditoria da IA
-- (prazo vencido, tipo nao identificado, promocao ativa parecida...).
-- So aprovarPropostaPromocao cria a promotion viva (status 'active') — "a IA le,
-- o humano publica". 'processing' = trava atomica durante a publicacao.
begin;

create table if not exists promotion_submission (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id),
  supplier_id uuid not null references supplier(id) on delete cascade,
  campus_id uuid references campus(id) on delete set null,
  source_material_id uuid references material(id) on delete set null,
  source_filename text,
  extracted jsonb not null default '{}'::jsonb,
  entrada jsonb not null default '{}'::jsonb,
  avisos jsonb not null default '[]'::jsonb,
  status text not null default 'pending_admin'
    check (status in ('pending_admin','processing','approved','rejected')),
  promotion_id uuid references promotion(id) on delete set null,
  created_by text, submitted_by text,
  admin_approved_by text, admin_approved_at timestamptz,
  rejected_by text, rejected_at timestamptz, reject_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create index if not exists promotion_submission_tenant_status_idx on promotion_submission(tenant_id, status);
create index if not exists promotion_submission_material_idx on promotion_submission(source_material_id);
alter table if exists promotion_submission enable row level security;

-- Rastreabilidade: promocao publicada a partir de uma proposta da IA.
alter table promotion add column if not exists source_submission_id uuid references promotion_submission(id) on delete set null;

-- Novo tipo de material: 'promocao' (flyer/oferta), legivel por IA (PDF ou imagem).
alter table material drop constraint if exists material_tipo_check;
alter table material add constraint material_tipo_check
  check (tipo in ('brochura','price_list','promocao','foto','video','apresentacao','midia_kit','logotipo','termos','outro'));

commit;
