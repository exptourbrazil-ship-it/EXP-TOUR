-- politica_retencao v3.1: âncoras assinatura/reserva (além de inicio_curso/
-- chegada_acomodacao). VanWest conta da assinatura; OISE/Regent da reserva.
-- Aditivo e idempotente. Rodar no Supabase SQL Editor. Os novos campos de degrau
-- (retencaoSemanas, minimo por degrau) vivem no jsonb `degraus` — sem DDL.
alter table if exists politica_retencao
  drop constraint if exists politica_retencao_ancora_check;
alter table if exists politica_retencao
  add constraint politica_retencao_ancora_check
  check (ancora in ('inicio_curso','chegada_acomodacao','assinatura','reserva'));
