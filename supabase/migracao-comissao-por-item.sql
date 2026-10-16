-- Comissao por tipo de item e por produto/programa/servico.
-- Hierarquia (a regra mais especifica vence): produto -> tipo de item -> acordo padrao
-- da escola (supplier_agreement). A fatura de comissao passa a ter LINHAS (uma por item),
-- cada uma com a base, a regra aplicada e a comissao; o total da fatura e a soma.
-- Faturas antigas (sem linhas) continuam validas como linha unica.

create table if not exists supplier_commission_rule (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id),
  supplier_id uuid not null references supplier(id) on delete cascade,
  scope text not null check (scope in ('kind','product')),
  kind text check (kind in ('program','accommodation','package','insurance','other','fee')),
  product_id uuid references product(id) on delete cascade,
  commission_basis text not null check (commission_basis in ('tuition','tuition_plus_fees','total','none')),
  commission_type text not null check (commission_type in ('percent','fixed_per_sale','fixed_per_week')),
  commission_value numeric(14,4) not null check (commission_value >= 0),
  currency char(3),
  valid_from date not null default current_date,
  valid_until date,
  notes text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  archived_at timestamptz,
  check ((scope = 'kind' and kind is not null and product_id is null) or (scope = 'product' and product_id is not null and kind is null))
);
create index if not exists idx_commission_rule_supplier on supplier_commission_rule(supplier_id) where archived_at is null;
-- Uma regra ATIVA (sem fim) por tipo e por produto.
create unique index if not exists idx_commission_rule_kind_ativa
  on supplier_commission_rule(supplier_id, kind) where scope = 'kind' and archived_at is null;
create unique index if not exists idx_commission_rule_product_ativa
  on supplier_commission_rule(supplier_id, product_id) where scope = 'product' and archived_at is null;
alter table supplier_commission_rule enable row level security;

create table if not exists comissao_fatura_item (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id),
  fatura_id uuid not null references comissao_fatura(id) on delete cascade,
  sort int not null default 0,
  kind text check (kind in ('program','accommodation','package','insurance','other','fee')),
  product_id uuid references product(id) on delete set null,
  description text not null,
  base_amount numeric(14,2) not null check (base_amount > 0),
  commission_basis text,
  commission_type text,
  commission_value numeric(14,4),
  rule_source text check (rule_source in ('produto','tipo','padrao','manual')),
  commission_amount numeric(14,2) not null check (commission_amount >= 0),
  created_at timestamptz not null default now()
);
create index if not exists idx_comissao_fatura_item_fatura on comissao_fatura_item(fatura_id, sort);
alter table comissao_fatura_item enable row level security;
