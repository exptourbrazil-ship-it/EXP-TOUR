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

alter table titulares enable row level security;
alter table contratos enable row level security;
alter table parcelas enable row level security;

-- OBS: login e feito por CPF + codigo via WhatsApp (fora do Supabase Auth padrao),
-- entao as policies de RLS finais serao definidas quando o fluxo de autenticacao
-- customizado estiver implementado (via Edge Function com service role).
