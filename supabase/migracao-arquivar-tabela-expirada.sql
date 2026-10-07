-- Tabela de preco EXPIRADA se arquiva sozinha.
--
-- Regra: price_template.status = 'expired'  =>  archived_at preenchido.
--
-- Hoje uma tabela vira 'expired' por tres caminhos: o supersede de um price list
-- novo aprovado (price-admin-service.ts), o "Arquivar" do hub (que ja grava
-- archived_at) e edicao manual no SQL Editor. Os dois primeiros sem trigger
-- deixavam centenas de tabelas expiradas "nao arquivadas" poluindo as telas.
-- O trigger cobre TODOS os caminhos, inclusive codigo futuro.
--
-- Volta: se uma tabela expirada for REATIVADA (status deixa de ser 'expired') e o
-- archived_at nao foi mexido na mesma operacao, o trigger limpa o archived_at —
-- senao ficaria "ativa mas arquivada", invisivel ao motor de preco.
-- (Quem reativa E altera archived_at de proposito, a escolha dele prevalece.)
--
-- Idempotente. Aplicar no SQL Editor do Supabase (espelhado em schema.sql).
-- O BACKFILL (parte 2) e separado e so deve rodar depois de conferir a contagem.

-- ── Parte 1: funcao + trigger ───────────────────────────────────────────────
create or replace function price_template_arquivar_expirada()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'expired' and new.archived_at is null then
    -- Expirou sem arquivar: arquiva agora.
    new.archived_at := now();
  elsif tg_op = 'UPDATE'
        and old.status = 'expired'
        and new.status <> 'expired'
        and new.archived_at is not null
        and new.archived_at is not distinct from old.archived_at then
    -- Reativada sem mexer em archived_at: volta a ficar visivel ao motor.
    new.archived_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_price_template_arquivar_expirada on price_template;
create trigger trg_price_template_arquivar_expirada
  before insert or update on price_template
  for each row execute function price_template_arquivar_expirada();

-- ── Parte 2: BACKFILL (rodar UMA vez, depois da parte 1) ────────────────────
-- 2a) Quantas tabelas expiradas ainda nao estao arquivadas (esperado: ~237).
select count(*) as expiradas_nao_arquivadas
  from price_template
 where status = 'expired' and archived_at is null;

-- 2b) Arquiva todas (as ja arquivadas nao sao tocadas).
-- update price_template set archived_at = now()
--  where status = 'expired' and archived_at is null;
