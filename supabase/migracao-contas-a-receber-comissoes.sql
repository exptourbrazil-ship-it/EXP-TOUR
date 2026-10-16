-- Contas a receber de comissao das escolas: quando o aluno paga o programa
-- DIRETO a escola, a EXP Tour fatura a comissao a ela. Uma fatura por caso,
-- recebimentos (parciais ou total) registrados por acao auditada do financeiro.
-- Autorizacao feita em codigo (RLS ligado sem policy), como o resto do projeto.

create sequence if not exists comissao_fatura_seq;

create table if not exists comissao_fatura (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id),
  supplier_id uuid not null references supplier(id),
  contrato_id uuid references contratos(id) on delete set null,
  numero text not null default ('EXP-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('comissao_fatura_seq')::text, 4, '0')),
  status text not null default 'rascunho' check (status in ('rascunho','emitida','enviada','paga','cancelada')),
  currency char(3) not null,
  -- o que o aluno pagou direto a escola (base da comissao)
  student_name text,
  program_name text,
  start_date date,
  end_date date,
  weeks numeric,
  paid_to_school_amount numeric(14,2) not null check (paid_to_school_amount > 0),
  paid_to_school_at date,
  -- acordo aplicado (snapshot) e valor da comissao
  commission_basis text,
  commission_type text,
  commission_value numeric(14,4),
  commission_amount numeric(14,2) not null check (commission_amount >= 0),
  issue_date date,
  due_date date,
  sent_at timestamptz,
  sent_to text[],
  received_amount numeric(14,2) not null default 0 check (received_amount >= 0),
  paid_at date,
  notes text,
  -- retorno da escola pelo portal (nao muda dinheiro: so informa)
  school_expected_at date,
  school_note text,
  school_note_at timestamptz,
  school_note_by text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  unique (tenant_id, numero)
);
create index if not exists idx_comissao_fatura_tenant_status on comissao_fatura(tenant_id, status, due_date);
create index if not exists idx_comissao_fatura_supplier on comissao_fatura(supplier_id, created_at desc);
-- Uma fatura ATIVA por caso: guarda de banco contra cobranca em duplicidade.
create unique index if not exists idx_comissao_fatura_contrato_ativa
  on comissao_fatura(tenant_id, contrato_id) where contrato_id is not null and status <> 'cancelada';
alter table comissao_fatura enable row level security;

create table if not exists comissao_recebimento (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id),
  fatura_id uuid not null references comissao_fatura(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  received_at date not null,
  reference text,
  proof_storage_path text,
  proof_filename text,
  notes text,
  registered_by text,
  created_at timestamptz not null default now()
);
create index if not exists idx_comissao_recebimento_fatura on comissao_recebimento(fatura_id, received_at);
alter table comissao_recebimento enable row level security;

-- Dados do EMISSOR (EXP Tour/Forio) que saem na fatura: razao social, endereco,
-- identificacao fiscal, contato e instrucoes de pagamento (dados bancarios).
alter table tenant_config add column if not exists fatura_emissor jsonb;

-- Registro de recebimento ATOMICO: trava a fatura, valida o saldo, grava o
-- recebimento e atualiza o total/estado na mesma transacao. Dinheiro so muda por aqui.
create or replace function registrar_recebimento_comissao(
  p_tenant uuid, p_fatura uuid, p_amount numeric, p_received_at date,
  p_reference text, p_notes text, p_proof_path text, p_proof_name text, p_user text
) returns table (recebimento_id uuid, received_total numeric, status text)
language plpgsql
set search_path = public, pg_temp
as $$
declare
  f comissao_fatura%rowtype;
  novo numeric(14,2);
  rid uuid;
  novo_status text;
begin
  select * into f from comissao_fatura where id = p_fatura and tenant_id = p_tenant for update;
  if not found then raise exception 'fatura_nao_encontrada'; end if;
  if f.status not in ('emitida','enviada') then raise exception 'fatura_nao_recebivel'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'valor_invalido'; end if;
  if f.received_amount + p_amount > f.commission_amount then raise exception 'valor_excede_saldo'; end if;
  insert into comissao_recebimento (tenant_id, fatura_id, amount, received_at, reference, proof_storage_path, proof_filename, notes, registered_by)
    values (p_tenant, p_fatura, p_amount, p_received_at, p_reference, p_proof_path, p_proof_name, p_notes, p_user)
    returning id into rid;
  novo := f.received_amount + p_amount;
  novo_status := case when novo >= f.commission_amount then 'paga' else f.status end;
  update comissao_fatura
     set received_amount = novo, status = novo_status,
         paid_at = case when novo_status = 'paga' then p_received_at else paid_at end,
         updated_at = now()
   where id = p_fatura;
  return query select rid, novo, novo_status;
end $$;
revoke execute on function registrar_recebimento_comissao(uuid, uuid, numeric, date, text, text, text, text, text) from public, anon, authenticated;
