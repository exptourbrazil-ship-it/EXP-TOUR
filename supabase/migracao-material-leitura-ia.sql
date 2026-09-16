-- F3.1 (módulo Fornecedores): LEITURA DE MATERIAL POR IA → proposta de PREÇO pendente.
-- Um material do tipo 'price_list' (PDF) subido no portal ou pelo admin entra numa
-- fila de leitura (cron diário + botão "Ler com IA" no hub); a leitura reusa o
-- extrator que já roda em produção (extrairPriceListPdf) e cria uma price_submission
-- PENDENTE vinculada ao material (source_material_id) — que cai na fila de aprovação
-- existente e só materializa produtos/preços/taxas quando o admin publicar.
-- Aditiva e idempotente. Aplicada em produção em 16/09/2026.
alter table if exists material add column if not exists leitura_status text not null default 'nao_aplicavel';
alter table if exists material add column if not exists leitura_em timestamptz;
alter table if exists material add column if not exists leitura_erro text;
-- Tentativas: falha transitória (rede/429) devolve o material à fila até o teto
-- (LEITURA_MAX_TENTATIVAS, default 3); só então vira 'erro' definitivo.
alter table if exists material add column if not exists leitura_tentativas int not null default 0;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'material_leitura_status_check') then
    alter table material add constraint material_leitura_status_check
      check (leitura_status in ('nao_aplicavel','pendente','lendo','lida','sem_ia','erro','precisa_campus','nao_suportado'));
  end if;
end $$;
create index if not exists idx_material_leitura on material(tenant_id, leitura_status) where archived_at is null;
alter table if exists price_submission add column if not exists source_material_id uuid references material(id) on delete set null;
create index if not exists idx_price_submission_source_material on price_submission(source_material_id);
-- Backfill: price lists em PDF já subidos entram na fila de leitura.
update material set leitura_status = 'pendente'
 where tipo = 'price_list' and mime = 'application/pdf' and archived_at is null
   and status <> 'rejeitado' and leitura_status = 'nao_aplicavel';
-- Backfill: price lists por link/imagem já subidos ficam 'nao_suportado' (rótulo honesto:
-- "só PDF é lido"), espelhando statusLeituraInicial para linhas novas.
update material set leitura_status = 'nao_suportado'
 where tipo = 'price_list' and archived_at is null and leitura_status = 'nao_aplicavel'
   and (link_url is not null or mime is distinct from 'application/pdf');
