-- Spread de intermediacao e cambio por VIGENCIA.
--
-- Motivo: o spread compoe a `cotacao_vet` que o cliente PAGA, e vivia so na env
-- SPREAD_CAMBIO_PERCENTUAL. Em producao a env estava em 6,6% enquanto o rodape
-- da proposta anunciava 5% — ninguem viu, porque nao havia registro datado nem
-- tela. Mesmo desenho de `iof_vigencia`: uma linha por mudanca, com data.
--
-- Leem daqui: o cron atualizar-cambio e o cambio manual (ao COMPOR a VET) e
-- carregarConfigTenant (ao RECOMPOR a VET na geracao da cobranca). Os tres
-- precisam do mesmo percentual: se so a composicao mudasse, a tela mostraria 5%
-- e o Pix cobraria 6,6%.
--
-- Aplicar ANTES do deploy: com a tabela ausente, a leitura devolve null, o
-- codigo cai no env (6,6%) e o cron sobrescreve as linhas do dia.
create table if not exists spread_cambio_vigencia (
  id uuid primary key default gen_random_uuid(),
  percentual numeric(6,4) not null check (percentual >= 0 and percentual <= 1),
  vigente_desde date not null unique,
  observacao text,
  criado_em timestamptz not null default now()
);

-- RLS habilitado SEM policies: toda autorizacao e feita em codigo (as rotas usam
-- a service role). A tabela e global/federal, como iof_vigencia — nao tem tenant.
alter table if exists spread_cambio_vigencia enable row level security;

comment on table spread_cambio_vigencia is
  'Spread de intermediacao e cambio por vigencia. Compoe a VET junto com PTAX e IOF (modelo aditivo).';

insert into spread_cambio_vigencia (percentual, vigente_desde, observacao)
values (0.0500, '2026-09-21', 'Spread de 5% para TODAS as moedas (decisao do titular em 21/09/2026). Substitui os 6,6% que estavam na env SPREAD_CAMBIO_PERCENTUAL enquanto a proposta anunciava 5%.')
on conflict (vigente_desde) do nothing;
