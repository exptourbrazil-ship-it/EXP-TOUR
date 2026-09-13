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
-- ⚠️ MANUTENÇÃO ANUAL (feriados NÃO são recorrentes!)
--  A tabela `feriado` guarda DATAS específicas (uma linha por feriado por ano),
--  porque muitos são móveis (Páscoa, n-ésima segunda, "observed"/mondayised).
--  Portanto o calendário precisa ser RECARREGADO a cada ano.
--  REGRA: manter sempre pelo menos o ANO CORRENTE + 2 (Y+2) já carregados.
--  Aplicado até aqui: 2026, 2027, 2028 e 2029 (canada, australia, eua,
--  nova_zelandia, reino_unido, irlanda). Antes de 2029 acabar, gere e rode 2030+.
--  COMO GERAR os próximos anos (datas móveis já calculadas): use os scripts Node
--  do PR que criou este arquivo (Meeus para a Páscoa + n-ésima segunda + regras
--  de observância) — ver o histórico do commit. Ou calcule manualmente e adicione
--  linhas no MESMO formato abaixo, com o `on conflict` para não duplicar.
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

-- EUA (federais 2026). pais = 'eua'. Jul 4 no sábado -> observado sex 03/07.
insert into feriado (tenant_id, pais, data, nome) values
  (null,'eua','2026-01-01','New Year''s Day'),
  (null,'eua','2026-01-19','Martin Luther King Jr. Day'),
  (null,'eua','2026-02-16','Presidents'' Day'),
  (null,'eua','2026-05-25','Memorial Day'),
  (null,'eua','2026-06-19','Juneteenth'),
  (null,'eua','2026-07-03','Independence Day (observed)'),
  (null,'eua','2026-09-07','Labor Day'),
  (null,'eua','2026-10-12','Columbus Day'),
  (null,'eua','2026-11-11','Veterans Day'),
  (null,'eua','2026-11-26','Thanksgiving'),
  (null,'eua','2026-12-25','Christmas Day')
on conflict (pais, data) where tenant_id is null do nothing;

-- Nova Zelândia (nacionais 2026). Anzac 25/04 sáb -> Mondayised 27/04.
insert into feriado (tenant_id, pais, data, nome) values
  (null,'nova_zelandia','2026-01-01','New Year''s Day'),
  (null,'nova_zelandia','2026-01-02','Day after New Year''s Day'),
  (null,'nova_zelandia','2026-02-06','Waitangi Day'),
  (null,'nova_zelandia','2026-04-03','Good Friday'),
  (null,'nova_zelandia','2026-04-06','Easter Monday'),
  (null,'nova_zelandia','2026-04-27','Anzac Day (observed)'),
  (null,'nova_zelandia','2026-06-01','King''s Birthday'),
  (null,'nova_zelandia','2026-10-26','Labour Day'),
  (null,'nova_zelandia','2026-12-25','Christmas Day'),
  (null,'nova_zelandia','2026-12-28','Boxing Day (observed)')
on conflict (pais, data) where tenant_id is null do nothing;

-- Reino Unido (Inglaterra/Gales, 2026). ⚠️ confirme o slug de pais_destino.
insert into feriado (tenant_id, pais, data, nome) values
  (null,'reino_unido','2026-01-01','New Year''s Day'),
  (null,'reino_unido','2026-04-03','Good Friday'),
  (null,'reino_unido','2026-04-06','Easter Monday'),
  (null,'reino_unido','2026-05-04','Early May Bank Holiday'),
  (null,'reino_unido','2026-05-25','Spring Bank Holiday'),
  (null,'reino_unido','2026-08-31','Summer Bank Holiday'),
  (null,'reino_unido','2026-12-25','Christmas Day'),
  (null,'reino_unido','2026-12-28','Boxing Day (substitute)')
on conflict (pais, data) where tenant_id is null do nothing;

-- Irlanda (2026). ⚠️ confirme o slug de pais_destino.
insert into feriado (tenant_id, pais, data, nome) values
  (null,'irlanda','2026-01-01','New Year''s Day'),
  (null,'irlanda','2026-02-02','St Brigid''s Day'),
  (null,'irlanda','2026-03-17','St Patrick''s Day'),
  (null,'irlanda','2026-04-06','Easter Monday'),
  (null,'irlanda','2026-05-04','May Bank Holiday'),
  (null,'irlanda','2026-06-01','June Bank Holiday'),
  (null,'irlanda','2026-08-03','August Bank Holiday'),
  (null,'irlanda','2026-10-26','October Bank Holiday'),
  (null,'irlanda','2026-12-25','Christmas Day'),
  (null,'irlanda','2026-12-28','St Stephen''s Day (substitute)')
on conflict (pais, data) where tenant_id is null do nothing;

-- MODELO para Malta (lista de ~14 feriados a confirmar) — descomente e complete:
-- insert into feriado (tenant_id, pais, data, nome) values
--   (null,'malta','2026-01-01','L-Ewwel tas-Sena')
-- on conflict (pais, data) where tenant_id is null do nothing;

-- ----------------------------------------------------------------------------
-- 1b) FERIADOS 2027 (APLICADOS) — recarregar anualmente (ver MANUTENÇÃO Y+2)
-- ----------------------------------------------------------------------------
insert into feriado (tenant_id, pais, data, nome) values
  (null,'canada','2027-01-01','New Year''s Day'),(null,'canada','2027-03-26','Good Friday'),
  (null,'canada','2027-05-24','Victoria Day'),(null,'canada','2027-07-01','Canada Day'),
  (null,'canada','2027-09-06','Labour Day'),(null,'canada','2027-09-30','National Day for Truth and Reconciliation'),
  (null,'canada','2027-10-11','Thanksgiving'),(null,'canada','2027-11-11','Remembrance Day'),
  (null,'canada','2027-12-25','Christmas Day'),(null,'canada','2027-12-26','Boxing Day'),
  (null,'australia','2027-01-01','New Year''s Day'),(null,'australia','2027-01-26','Australia Day'),
  (null,'australia','2027-03-26','Good Friday'),(null,'australia','2027-03-27','Easter Saturday'),
  (null,'australia','2027-03-29','Easter Monday'),(null,'australia','2027-04-25','Anzac Day'),
  (null,'australia','2027-12-25','Christmas Day'),(null,'australia','2027-12-27','Boxing Day'),
  (null,'eua','2027-01-01','New Year''s Day'),(null,'eua','2027-01-18','Martin Luther King Jr. Day'),
  (null,'eua','2027-02-15','Presidents'' Day'),(null,'eua','2027-05-31','Memorial Day'),
  (null,'eua','2027-06-18','Juneteenth'),(null,'eua','2027-07-05','Independence Day'),
  (null,'eua','2027-09-06','Labor Day'),(null,'eua','2027-10-11','Columbus Day'),
  (null,'eua','2027-11-11','Veterans Day'),(null,'eua','2027-11-25','Thanksgiving'),(null,'eua','2027-12-24','Christmas Day'),
  (null,'nova_zelandia','2027-01-01','New Year''s Day'),(null,'nova_zelandia','2027-01-02','Day after New Year''s Day'),
  (null,'nova_zelandia','2027-02-08','Waitangi Day'),(null,'nova_zelandia','2027-03-26','Good Friday'),
  (null,'nova_zelandia','2027-03-29','Easter Monday'),(null,'nova_zelandia','2027-04-26','Anzac Day'),
  (null,'nova_zelandia','2027-06-07','King''s Birthday'),(null,'nova_zelandia','2027-10-25','Labour Day'),
  (null,'nova_zelandia','2027-12-25','Christmas Day'),(null,'nova_zelandia','2027-12-27','Boxing Day'),
  (null,'reino_unido','2027-01-01','New Year''s Day'),(null,'reino_unido','2027-03-26','Good Friday'),
  (null,'reino_unido','2027-03-29','Easter Monday'),(null,'reino_unido','2027-05-03','Early May Bank Holiday'),
  (null,'reino_unido','2027-05-31','Spring Bank Holiday'),(null,'reino_unido','2027-08-30','Summer Bank Holiday'),
  (null,'reino_unido','2027-12-27','Christmas Day'),(null,'reino_unido','2027-12-28','Boxing Day'),
  (null,'irlanda','2027-01-01','New Year''s Day'),(null,'irlanda','2027-02-01','St Brigid''s Day'),
  (null,'irlanda','2027-03-17','St Patrick''s Day'),(null,'irlanda','2027-03-29','Easter Monday'),
  (null,'irlanda','2027-05-03','May Bank Holiday'),(null,'irlanda','2027-06-07','June Bank Holiday'),
  (null,'irlanda','2027-08-02','August Bank Holiday'),(null,'irlanda','2027-10-25','October Bank Holiday'),
  (null,'irlanda','2027-12-27','Christmas Day'),(null,'irlanda','2027-12-28','St Stephen''s Day')
on conflict (pais, data) where tenant_id is null do nothing;

-- ----------------------------------------------------------------------------
-- 1c) FERIADOS 2028 (APLICADOS)
-- ----------------------------------------------------------------------------
insert into feriado (tenant_id, pais, data, nome) values
  (null,'canada','2028-01-01','New Year''s Day'),(null,'canada','2028-04-14','Good Friday'),
  (null,'canada','2028-05-22','Victoria Day'),(null,'canada','2028-07-03','Canada Day'),
  (null,'canada','2028-09-04','Labour Day'),(null,'canada','2028-09-30','National Day for Truth and Reconciliation'),
  (null,'canada','2028-10-09','Thanksgiving'),(null,'canada','2028-11-11','Remembrance Day'),
  (null,'canada','2028-12-25','Christmas Day'),(null,'canada','2028-12-26','Boxing Day'),
  (null,'australia','2028-01-01','New Year''s Day'),(null,'australia','2028-01-26','Australia Day'),
  (null,'australia','2028-04-14','Good Friday'),(null,'australia','2028-04-15','Easter Saturday'),
  (null,'australia','2028-04-17','Easter Monday'),(null,'australia','2028-04-25','Anzac Day'),
  (null,'australia','2028-12-25','Christmas Day'),(null,'australia','2028-12-26','Boxing Day'),
  (null,'eua','2027-12-31','New Year''s Day (observed)'),(null,'eua','2028-01-17','Martin Luther King Jr. Day'),
  (null,'eua','2028-02-21','Presidents'' Day'),(null,'eua','2028-05-29','Memorial Day'),
  (null,'eua','2028-06-19','Juneteenth'),(null,'eua','2028-07-04','Independence Day'),
  (null,'eua','2028-09-04','Labor Day'),(null,'eua','2028-10-09','Columbus Day'),
  (null,'eua','2028-11-10','Veterans Day'),(null,'eua','2028-11-23','Thanksgiving'),(null,'eua','2028-12-25','Christmas Day'),
  (null,'nova_zelandia','2028-01-01','New Year''s Day'),(null,'nova_zelandia','2028-01-02','Day after New Year''s Day'),
  (null,'nova_zelandia','2028-02-07','Waitangi Day'),(null,'nova_zelandia','2028-04-14','Good Friday'),
  (null,'nova_zelandia','2028-04-17','Easter Monday'),(null,'nova_zelandia','2028-04-25','Anzac Day'),
  (null,'nova_zelandia','2028-06-05','King''s Birthday'),(null,'nova_zelandia','2028-10-23','Labour Day'),
  (null,'nova_zelandia','2028-12-25','Christmas Day'),(null,'nova_zelandia','2028-12-26','Boxing Day'),
  (null,'reino_unido','2028-01-03','New Year''s Day'),(null,'reino_unido','2028-04-14','Good Friday'),
  (null,'reino_unido','2028-04-17','Easter Monday'),(null,'reino_unido','2028-05-01','Early May Bank Holiday'),
  (null,'reino_unido','2028-05-29','Spring Bank Holiday'),(null,'reino_unido','2028-08-28','Summer Bank Holiday'),
  (null,'reino_unido','2028-12-25','Christmas Day'),(null,'reino_unido','2028-12-26','Boxing Day'),
  (null,'irlanda','2028-01-03','New Year''s Day'),(null,'irlanda','2028-02-07','St Brigid''s Day'),
  (null,'irlanda','2028-03-17','St Patrick''s Day'),(null,'irlanda','2028-04-17','Easter Monday'),
  (null,'irlanda','2028-05-01','May Bank Holiday'),(null,'irlanda','2028-06-05','June Bank Holiday'),
  (null,'irlanda','2028-08-07','August Bank Holiday'),(null,'irlanda','2028-10-30','October Bank Holiday'),
  (null,'irlanda','2028-12-25','Christmas Day'),(null,'irlanda','2028-12-26','St Stephen''s Day')
on conflict (pais, data) where tenant_id is null do nothing;

-- ----------------------------------------------------------------------------
-- 1d) FERIADOS 2029 (APLICADOS)
-- ----------------------------------------------------------------------------
insert into feriado (tenant_id, pais, data, nome) values
  (null,'canada','2029-01-01','New Year''s Day'),(null,'canada','2029-03-30','Good Friday'),
  (null,'canada','2029-05-21','Victoria Day'),(null,'canada','2029-07-02','Canada Day'),
  (null,'canada','2029-09-03','Labour Day'),(null,'canada','2029-09-30','National Day for Truth and Reconciliation'),
  (null,'canada','2029-10-08','Thanksgiving'),(null,'canada','2029-11-11','Remembrance Day'),
  (null,'canada','2029-12-25','Christmas Day'),(null,'canada','2029-12-26','Boxing Day'),
  (null,'australia','2029-01-01','New Year''s Day'),(null,'australia','2029-01-26','Australia Day'),
  (null,'australia','2029-03-30','Good Friday'),(null,'australia','2029-03-31','Easter Saturday'),
  (null,'australia','2029-04-02','Easter Monday'),(null,'australia','2029-04-25','Anzac Day'),
  (null,'australia','2029-12-25','Christmas Day'),(null,'australia','2029-12-26','Boxing Day'),
  (null,'eua','2029-01-01','New Year''s Day'),(null,'eua','2029-01-15','Martin Luther King Jr. Day'),
  (null,'eua','2029-02-19','Presidents'' Day'),(null,'eua','2029-05-28','Memorial Day'),
  (null,'eua','2029-06-19','Juneteenth'),(null,'eua','2029-07-04','Independence Day'),
  (null,'eua','2029-09-03','Labor Day'),(null,'eua','2029-10-08','Columbus Day'),
  (null,'eua','2029-11-12','Veterans Day'),(null,'eua','2029-11-22','Thanksgiving'),(null,'eua','2029-12-25','Christmas Day'),
  (null,'nova_zelandia','2029-01-01','New Year''s Day'),(null,'nova_zelandia','2029-01-02','Day after New Year''s Day'),
  (null,'nova_zelandia','2029-02-06','Waitangi Day'),(null,'nova_zelandia','2029-03-30','Good Friday'),
  (null,'nova_zelandia','2029-04-02','Easter Monday'),(null,'nova_zelandia','2029-04-25','Anzac Day'),
  (null,'nova_zelandia','2029-06-04','King''s Birthday'),(null,'nova_zelandia','2029-10-22','Labour Day'),
  (null,'nova_zelandia','2029-12-25','Christmas Day'),(null,'nova_zelandia','2029-12-26','Boxing Day'),
  (null,'reino_unido','2029-01-01','New Year''s Day'),(null,'reino_unido','2029-03-30','Good Friday'),
  (null,'reino_unido','2029-04-02','Easter Monday'),(null,'reino_unido','2029-05-07','Early May Bank Holiday'),
  (null,'reino_unido','2029-05-28','Spring Bank Holiday'),(null,'reino_unido','2029-08-27','Summer Bank Holiday'),
  (null,'reino_unido','2029-12-25','Christmas Day'),(null,'reino_unido','2029-12-26','Boxing Day'),
  (null,'irlanda','2029-01-01','New Year''s Day'),(null,'irlanda','2029-02-05','St Brigid''s Day'),
  (null,'irlanda','2029-03-19','St Patrick''s Day (observed)'),(null,'irlanda','2029-04-02','Easter Monday'),
  (null,'irlanda','2029-05-07','May Bank Holiday'),(null,'irlanda','2029-06-04','June Bank Holiday'),
  (null,'irlanda','2029-08-06','August Bank Holiday'),(null,'irlanda','2029-10-29','October Bank Holiday'),
  (null,'irlanda','2029-12-25','Christmas Day'),(null,'irlanda','2029-12-26','St Stephen''s Day')
on conflict (pais, data) where tenant_id is null do nothing;

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
