-- Anexo III / Contrato v3.1 — entidades NOVAS (complementam politica_retencao,
-- que já existe). Rodar no Supabase SQL Editor. Aditivo e idempotente.
--
-- 1) product.componente  — Componente Educacional (Cláusula 1.1.g.1): base da
--    Remuneração por Serviços Prestados, ≠ Custo do Programa. Default educacional;
--    seguro/outros e pacotes de terceiro marcam 'terceiro'.
-- 2) taxa_obrigatoria     — taxas que compõem a Entrada, por campus (além de fee).
-- 3) exigencia_antecipacao— REGRA por campus que ativa a Cláusula 7.5 (distinta da
--    tabela `antecipacoes`, que é a instância por-contrato).
-- 4) campus_politica      — política do campus (intake máximo vendável, reembolso
--    destinatário/prazo/forma/crédito, proteção estudantil, fonte da política,
--    país do calendário para regras em dias úteis).

-- 1) Componente Educacional no item de catálogo -----------------------------
alter table if exists product
  add column if not exists componente text not null default 'educacional'
  check (componente in ('educacional','terceiro'));

-- 2) TaxaObrigatoria ---------------------------------------------------------
create table if not exists taxa_obrigatoria (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id),
  campus_id uuid not null references campus(id) on delete cascade,
  nome text not null,
  valor numeric(14,2) not null check (valor >= 0),
  moeda char(3) not null,
  condicao_aplicacao text not null default 'sempre'
    check (condicao_aplicacao in ('sempre','com_acomodacao','com_residencia','duracao_min','destino_especifico')),
  duracao_minima_semanas int,                 -- usado quando condicao = duracao_min
  reembolsavel boolean not null default false,
  vencimento_dias int not null default 0 check (vencimento_dias >= 0), -- assinatura + N dias corridos
  componente text not null default 'educacional' check (componente in ('educacional','terceiro')),
  ativo boolean not null default true,
  ordem int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create index if not exists idx_taxa_obrigatoria_campus on taxa_obrigatoria(campus_id) where ativo;
alter table if exists taxa_obrigatoria enable row level security;

-- 3) ExigenciaAntecipacao (regra por campus; ativa a Cláusula 7.5) -----------
create table if not exists exigencia_antecipacao (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id),
  campus_id uuid not null references campus(id) on delete cascade,
  ativa boolean not null default false,
  evento_gerador text not null
    check (evento_gerador in ('emissao_documento_visto','confirmacao_reserva','manutencao_reserva')),
  documento_viabilizado text not null,
  valor numeric(14,2) check (valor is null or valor >= 0),
  percentual numeric(6,3) check (percentual is null or (percentual >= 0 and percentual <= 100)),
  moeda char(3),
  data_limite_ancora text not null
    check (data_limite_ancora in ('inicio_curso','chegada_acomodacao','assinatura','reserva')),
  data_limite_unidade text not null
    check (data_limite_unidade in ('dias_corridos','dias_uteis','semanas')),
  data_limite_valor numeric(10,2) not null,
  comprovante_ref text,                 -- Cláusula 7.5.1: obrigatório quando ativa
  condicao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  -- Exatamente um de valor / percentual; valor exige moeda; ativa exige comprovante.
  constraint exig_valor_xor_pct check (num_nonnulls(valor, percentual) = 1),
  constraint exig_valor_moeda check (valor is null or moeda is not null),
  constraint exig_ativa_comprovante check (not ativa or comprovante_ref is not null)
);
create index if not exists idx_exig_antecip_campus on exigencia_antecipacao(campus_id) where ativa;
alter table if exists exigencia_antecipacao enable row level security;

-- 4) CampusPolitica (1:1 com campus) ----------------------------------------
create table if not exists campus_politica (
  campus_id uuid primary key references campus(id) on delete cascade,
  tenant_id uuid not null references tenant(id),
  intake_maximo_vendavel date,          -- até quando há preço confirmado (bloqueio §7)
  prazo_pagamento_ancora text not null default 'inicio_curso'
    check (prazo_pagamento_ancora in ('inicio_curso','chegada_acomodacao','assinatura','reserva')),
  prazo_pagamento_unidade text not null default 'dias_corridos'
    check (prazo_pagamento_unidade in ('dias_corridos','dias_uteis','semanas')),
  prazo_pagamento_valor numeric(10,2) not null default 30,
  reembolso_destinatario text not null default 'agencia' check (reembolso_destinatario in ('agencia','aluno')),
  reembolso_prazo_dias int not null default 0 check (reembolso_prazo_dias >= 0),
  reembolso_forma text not null default 'dinheiro' check (reembolso_forma in ('dinheiro','credito')),
  credito_validade_meses int check (credito_validade_meses is null or credito_validade_meses > 0),
  credito_transferivel boolean not null default false,
  credito_escopo text,
  politica_fonte text not null default 'contrato_representacao'
    check (politica_fonte in ('contrato_representacao','site')),
  politica_url text,
  politica_snapshot_ref text,
  politica_versao text,
  politica_data date,
  protecao_estudantil text not null default 'nenhum'
    check (protecao_estudantil in ('conta_fiduciaria','fundo','garantia','nenhum')),
  calendario_feriados_pais text,        -- país (tabela `feriado`.pais) p/ regras em dias úteis
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  -- forma=credito exige validade em meses.
  constraint campus_pol_credito check (reembolso_forma <> 'credito' or credito_validade_meses is not null)
);
create index if not exists idx_campus_politica_tenant on campus_politica(tenant_id);
alter table if exists campus_politica enable row level security;
