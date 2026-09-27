-- Faixa de preco DERIVADA do catalogo (item 0.5a do plano do Diagnostico
-- Forio). Alimenta o "escape de preco" do Chat da Forio: quem pede preco antes
-- de fechar destino e duracao recebe p25 / mediana / p75 por destino x semanas,
-- com o que esta incluido. Gravada pelo cron /api/cron/atualizar-faixa-preco
-- (diario, depois do cambio) e lida por GET /api/public/preco/faixa.
--
-- origem = 'derivado' (cron sobrescreve) | 'manual' (admin fixou; o cron NAO
-- toca). Aplicar no SQL Editor do Supabase e refletir em schema.sql.
create table if not exists faixa_preco (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id),
  nivel text not null check (nivel in ('pais','cidade')),
  destino text not null,               -- rotulo do pais (ex.: 'UK') ou cidade (ex.: 'London')
  pais text not null,                  -- rotulo do pais (da cidade, quando nivel = cidade)
  semanas int not null check (semanas > 0),
  moeda char(3) not null,
  p25 numeric(12,2) not null,
  mediana numeric(12,2) not null,
  p75 numeric(12,2) not null,
  p25_brl numeric(12,2),
  mediana_brl numeric(12,2),
  p75_brl numeric(12,2),
  amostra int not null default 0,      -- programas que entraram na conta
  inclui text[] not null default '{}', -- linhas do orcamento presentes (curso, acomodacao, ...)
  origem text not null default 'derivado' check (origem in ('derivado','manual')),
  data_cambio date,                    -- cotacao usada na conversao BRL
  atualizado_em timestamptz not null default now(),
  unique (tenant_id, nivel, destino, semanas)
);
create index if not exists idx_faixa_preco_busca on faixa_preco(tenant_id, nivel, destino, semanas);
alter table if exists faixa_preco enable row level security;
