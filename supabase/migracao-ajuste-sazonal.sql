-- AJUSTE SAZONAL de acomodacao: o que as escolas publicam como "alta temporada
-- 14/jun a 23/ago: +EUR 40/semana" ou "baixa temporada 3/jan a 28/fev: -EUR 30/
-- semana". Ate aqui isso vivia SO como texto na descricao do produto e nao entrava
-- na conta da cotacao — o orcamento saia barato para estadias de verao.
--
-- Uma linha por INTERVALO (o periodo "3/jan a 28/fev e 1/nov a 31/dez" vira duas).
-- Sem ano (from_year/to_year nulos) = recorrente, vale todo ano, como a escola
-- publica. Com ano = so naquele ano. O intervalo pode cruzar a virada do ano
-- (15/dez a 10/jan) — quem resolve isso e o motor de preco.
--
-- amount_per_week: POSITIVO = suplemento, NEGATIVO = desconto. Fica em linha
-- separada na cotacao (decisao do usuario), nunca embutido no valor da acomodacao.
-- Aplicada em producao em 2026-09-19 (MCP). Idempotente.
begin;

create table if not exists seasonal_adjustment (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id),
  campus_id uuid not null references campus(id) on delete cascade,
  -- Nulo = vale para TODAS as acomodacoes do campus; preenchido = so este produto.
  product_id uuid references product(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('high_season','low_season','other')),
  amount_per_week numeric(14,2) not null,
  currency char(3) not null,
  from_month int not null check (from_month between 1 and 12),
  from_day int not null check (from_day between 1 and 31),
  from_year int check (from_year between 2000 and 2100),
  to_month int not null check (to_month between 1 and 12),
  to_day int not null check (to_day between 1 and 31),
  to_year int check (to_year between 2000 and 2100),
  -- O que a escola publicou, palavra por palavra: auditoria da leitura/carga.
  source_text text,
  -- Faixa de duracao em que o ajuste vale (nulo = sem limite): a GSE cobra 45/sem
  -- ate 7 semanas, 26 de 8 a 23 e 11 acima disso (migracao ajuste_sazonal_por_duracao).
  min_weeks int, max_weeks int,
  status text not null default 'active' check (status in ('active','archived')),
  created_at timestamptz not null default now(), updated_at timestamptz, archived_at timestamptz,
  -- Ajuste de zero nao muda nada e so polui a cotacao.
  constraint seasonal_adjustment_valor_nao_zero check (amount_per_week <> 0)
);

create index if not exists idx_seasonal_adjustment_lookup
  on seasonal_adjustment(tenant_id, campus_id, status);
-- A consulta real filtra tenant + campus + status (o campus-wide entra por
-- product_id nulo), e o produto quando especifico.
create index if not exists idx_seasonal_adjustment_produto
  on seasonal_adjustment(tenant_id, product_id, status) where product_id is not null;

alter table if exists seasonal_adjustment enable row level security;

commit;
