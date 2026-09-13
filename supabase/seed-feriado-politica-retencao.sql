-- ============================================================================
-- SEED DE EXEMPLO — feriados (dias úteis) + política de retenção por campus
-- ============================================================================
-- Base do motor de dias úteis (src/lib/dias-uteis.ts) e da escada de retenção
-- (src/lib/politica-retencao.ts) usada na PRÉVIA de reembolso unificado do
-- Caso 360 (GET /api/admin/contratos/[id]/reembolso-unificado).
--
-- COMO USAR: revise e rode no SQL Editor do Supabase. É idempotente
-- (ON CONFLICT / WHERE NOT EXISTS) — pode rodar mais de uma vez.
--
-- ATENÇÃO:
--  * Os FERIADOS abaixo são NACIONAIS factuais de 2026 (tenant NULL = valem para
--    todos os tenants). `pais` segue a convenção de contratos.pais_destino
--    (SLUG: 'canada','australia',...), NÃO o country_code ISO.
--  * As POLÍTICAS DE RETENÇÃO são EXEMPLOS/placeholder — os degraus, o teto e o
--    mínimo são decisão do jurídico/financeiro POR ESCOLA. NÃO use em produção
--    sem confirmar os números reais de cada campus (invoice/contrato da escola).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) FERIADOS NACIONAIS 2026 (dias úteis) — tenant_id NULL = nacional
-- ----------------------------------------------------------------------------
-- Canadá (feriados federais 2026). pais = 'canada' (slug de pais_destino).
insert into feriado (tenant_id, pais, data, nome) values
  (null, 'canada', '2026-01-01', 'New Year''s Day'),
  (null, 'canada', '2026-04-03', 'Good Friday'),
  (null, 'canada', '2026-05-18', 'Victoria Day'),
  (null, 'canada', '2026-07-01', 'Canada Day'),
  (null, 'canada', '2026-09-07', 'Labour Day'),
  (null, 'canada', '2026-09-30', 'National Day for Truth and Reconciliation'),
  (null, 'canada', '2026-10-12', 'Thanksgiving'),
  (null, 'canada', '2026-11-11', 'Remembrance Day'),
  (null, 'canada', '2026-12-25', 'Christmas Day'),
  (null, 'canada', '2026-12-26', 'Boxing Day')
on conflict (pais, data) where tenant_id is null do nothing;

-- Austrália (feriados nacionais 2026). pais = 'australia'.
insert into feriado (tenant_id, pais, data, nome) values
  (null, 'australia', '2026-01-01', 'New Year''s Day'),
  (null, 'australia', '2026-01-26', 'Australia Day'),
  (null, 'australia', '2026-04-03', 'Good Friday'),
  (null, 'australia', '2026-04-04', 'Easter Saturday'),
  (null, 'australia', '2026-04-06', 'Easter Monday'),
  (null, 'australia', '2026-04-25', 'Anzac Day'),
  (null, 'australia', '2026-12-25', 'Christmas Day'),
  (null, 'australia', '2026-12-28', 'Boxing Day (substitute)')
on conflict (pais, data) where tenant_id is null do nothing;

-- MODELO para outros destinos (descomente e ajuste as datas/slug conforme o
-- slug real usado em contratos.pais_destino do seu catálogo):
-- insert into feriado (tenant_id, pais, data, nome) values
--   (null, 'irlanda',      '2026-01-01', 'New Year''s Day'),
--   (null, 'malta',        '2026-01-01', 'L-Ewwel tas-Sena'),
--   (null, 'reino_unido',  '2026-01-01', 'New Year''s Day'),
--   (null, 'nova_zelandia','2026-01-01', 'New Year''s Day')
-- on conflict (pais, data) where tenant_id is null do nothing;

-- ----------------------------------------------------------------------------
-- 2) POLÍTICA DE RETENÇÃO POR CAMPUS — EXEMPLO/placeholder (CONFIRMAR!)
-- ----------------------------------------------------------------------------
-- Escada por proximidade da âncora (início do curso). Métrica = dias corridos
-- RESTANTES até o início; quanto mais perto/dentro, mais se retém.
--   > 60 dias  -> 0%
--   31 a 60    -> 25%
--   1 a 30     -> 50%
--   <= 0 (já começou) -> 100%
-- Substitua <CAMPUS_ID> pelo id real (tabela campus). A moeda cai no
-- base_currency do campus quando NULL. Ajuste degraus/teto/minimo por escola.
--
-- Exemplo para o campus "Unidade exp-tour" (CAD) — TROQUE o id e os números:
insert into politica_retencao (tenant_id, campus_id, ancora, unidade, degraus, moeda, teto, minimo, ativo, fonte)
select
  c.tenant_id,
  c.id,
  'inicio_curso',
  'dias_corridos',
  '[
    {"ate": 0,    "retencaoPercentual": 1.0,  "rotulo": "Após o início"},
    {"ate": 30,   "retencaoPercentual": 0.5,  "rotulo": "1 a 30 dias antes"},
    {"ate": 60,   "retencaoPercentual": 0.25, "rotulo": "31 a 60 dias antes"},
    {"ate": null, "retencaoPercentual": 0.0,  "rotulo": "Mais de 60 dias antes"}
  ]'::jsonb,
  null,        -- moeda: null => base_currency do campus
  null,        -- teto (cap) na moeda — ex.: 800
  null,        -- minimo (piso) na moeda
  true,
  'EXEMPLO — confirmar com jurídico/financeiro'
from campus c
where c.id = '40000000-0000-0000-0000-0000000000e1'  -- <CAMPUS_ID> (troque!)
  and not exists (
    select 1 from politica_retencao p
    where p.campus_id = c.id and p.ancora = 'inicio_curso' and p.ativo
  );

-- Exemplo de 2ª âncora (chegada da acomodação) para o MESMO campus, unidade em
-- semanas — descomente e ajuste:
-- insert into politica_retencao (tenant_id, campus_id, ancora, unidade, degraus, moeda, teto, minimo, ativo, fonte)
-- select c.tenant_id, c.id, 'chegada_acomodacao', 'semanas',
--   '[{"ate":0,"retencaoPercentual":1.0},{"ate":2,"retencaoPercentual":0.5},{"ate":4,"retencaoPercentual":0.25},{"ate":null,"retencaoPercentual":0.0}]'::jsonb,
--   null, null, null, true, 'EXEMPLO — confirmar'
-- from campus c
-- where c.id = '40000000-0000-0000-0000-0000000000e1'
--   and not exists (select 1 from politica_retencao p where p.campus_id = c.id and p.ancora = 'chegada_acomodacao' and p.ativo);

-- ----------------------------------------------------------------------------
-- 3) CONFERÊNCIA
-- ----------------------------------------------------------------------------
-- select pais, count(*) from feriado group by pais order by pais;
-- select c.name, p.ancora, p.unidade, p.degraus, p.moeda, p.teto, p.minimo
--   from politica_retencao p join campus c on c.id = p.campus_id where p.ativo;
