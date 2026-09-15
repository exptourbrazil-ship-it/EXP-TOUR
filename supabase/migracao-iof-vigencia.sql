-- IOF-câmbio por VIGÊNCIA (Contrato v3.1 §8: fonte única, tabela com vigência por
-- data). Global (IOF é federal, igual para todo tenant). A alíquota aplicada é a
-- vigente na data. Seed = 0,035 (3,5%, igual ao default de código) desde base
-- antiga => comportamento IDÊNTICO no seed. Rodar no Supabase SQL Editor.
create table if not exists iof_vigencia (
  id uuid primary key default gen_random_uuid(),
  aliquota numeric(6,4) not null check (aliquota >= 0 and aliquota <= 1),
  vigente_desde date not null unique,
  observacao text,
  criado_em timestamptz not null default now()
);
alter table if exists iof_vigencia enable row level security;

insert into iof_vigencia (aliquota, vigente_desde, observacao)
values (0.0350, '2020-01-01', 'Seed inicial (IOF-câmbio 3,5%) — igual ao default de código')
on conflict (vigente_desde) do nothing;
