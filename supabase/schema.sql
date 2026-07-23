-- EXP Tour / Forio - Schema inicial da Area do Cliente
-- Titulares: responsavel financeiro / login por CPF
create table if not exists titulares (
  id uuid primary key default gen_random_uuid(),
  nome_completo text not null,
  cpf text not null unique,
  telefone text,
  created_at timestamptz not null default now()
  );

-- Contratos: uma viagem/grupo contratado por um titular
create table if not exists contratos (
  id uuid primary key default gen_random_uuid(),
  titular_id uuid not null references titulares(id) on delete cascade,
  nome text not null,
  valor_total numeric(12,2) not null,
  moeda text not null default 'CAD',
  created_at timestamptz not null default now()
  );

-- Parcelas: cronograma de pagamento de cada contrato
create table if not exists parcelas (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references contratos(id) on delete cascade,
  numero int not null,
  descricao text not null,
  valor_original numeric(12,2) not null,
  valor_atual numeric(12,2) not null,
  vencimento date not null,
  is_entrada boolean not null default false,
  status text not null default 'pendente' check (status in ('pendente','pago','atrasado')),
  payment_link text,
  qr_code_url text,
  external_payment_id text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  unique (contrato_id, numero)
  );

create index if not exists idx_parcelas_contrato on parcelas(contrato_id);
create index if not exists idx_contratos_titular on contratos(titular_id);

-- Events: barramento/ledger de eventos externos (webhooks). Fonte de
-- idempotencia e auditoria. Cada notificacao externa vira uma linha; o efeito
-- (ex: marcar parcela como paga) e aplicado no maximo uma vez por
-- idempotency_key. Permite log de tentativas e reprocessamento manual.
create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  source text not null,                 -- ex: 'mercadopago'
  event_type text not null,             -- ex: 'payment'
  idempotency_key text not null unique, -- ex: 'mercadopago:payment:<paymentId>'
  external_id text,                     -- id do recurso na origem (ex: paymentId)
  payload jsonb,                        -- corpo bruto recebido, para auditoria/replay
  status text not null default 'pendente'
    check (status in ('pendente','processado','ignorado','erro')),
  tentativas int not null default 0,
  erro text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
  );

create index if not exists idx_events_status on events(status);
create index if not exists idx_events_source on events(source);
create index if not exists idx_events_external on events(source, external_id);

-- Lembretes de cobranca (regua): registra cada lembrete ja enviado por
-- (parcela, janela), garantindo idempotencia do cron da regua de cobranca
-- (ver src/app/api/cron/regua-cobranca). A constraint unique impede reenvio
-- do mesmo lembrete. Escrita/leitura apenas via service role (cron).
create table if not exists lembretes_cobranca (
  id uuid primary key default gen_random_uuid(),
  parcela_id uuid not null references parcelas(id) on delete cascade,
  janela text not null,               -- 'D-7' | 'D-2' | 'D+1' | 'D+5'
  enviado_at timestamptz not null default now(),
  unique (parcela_id, janela)
  );

create index if not exists idx_lembretes_parcela on lembretes_cobranca(parcela_id);

alter table titulares enable row level security;
alter table contratos enable row level security;
alter table parcelas enable row level security;
alter table events enable row level security;
alter table lembretes_cobranca enable row level security;

-- OBS: login e feito por CPF + codigo via WhatsApp (fora do Supabase Auth padrao),
-- entao as policies de RLS finais serao definidas quando o fluxo de autenticacao
-- customizado estiver implementado (via Edge Function com service role).
-- A tabela events e escrita/lida apenas via service role (rotas de API), nunca
-- pelo cliente, entao permanece sem policies publicas (RLS habilitado bloqueia
-- o acesso anon por padrao).
