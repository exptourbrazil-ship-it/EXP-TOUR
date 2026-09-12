-- Fatia 2 da matrícula — liga o LEAD à COTAÇÃO criada na conversão
-- (lead → cotação em rascunho no construtor). Idempotência + link na tela.
alter table if exists lead add column if not exists quote_id uuid references quote(id) on delete set null;
create index if not exists idx_lead_quote on lead(quote_id);
