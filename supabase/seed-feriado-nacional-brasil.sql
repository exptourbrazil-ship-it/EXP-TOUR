-- Feriados NACIONAIS do Brasil (pais='brasil', tenant_id NULL => valem para
-- todos os tenants) para o motor de DIAS ÚTEIS (src/lib/dias-uteis.ts) e o SLA
-- interno (painel /admin/sla + Fila do Dia, doc 18.6 — calendário de São Paulo).
--
-- Sem estes registros o motor conta só fim de semana; com eles, os prazos em
-- dias úteis pulam também os feriados abaixo.
--
-- Conjunto = feriados nacionais fixos (Lei 662/1949, 6.802/1980, 14.759/2023)
-- + os feriados MÓVEIS em que bancos/repartições fecham e que, por prática de
-- mercado, NÃO contam como dia útil para prazos: Carnaval (segunda e terça),
-- Sexta-feira Santa e Corpus Christi. (Carnaval e Corpus Christi são pontos
-- facultativos por lei; se a operação preferir tratá-los como dia útil, basta
-- remover as linhas correspondentes.)
--
-- Datas móveis calculadas a partir da Páscoa (Oeste): 2026-04-05, 2027-03-28,
-- 2028-04-16, 2029-04-01. Carnaval terça = Páscoa−47; Sexta-feira Santa =
-- Páscoa−2; Corpus Christi = Páscoa+60.
--
-- Idempotente: ON CONFLICT no índice parcial uq_feriado_nacional (pais,data)
-- WHERE tenant_id IS NULL. Rodar quantas vezes precisar; manutenção Y+? igual à
-- dos feriados dos países de destino (ver seed-feriado-politica-retencao.sql).

insert into feriado (tenant_id, pais, data, nome) values
  -- 2026 (fixos)
  (null, 'brasil', '2026-01-01', 'Confraternização Universal'),
  (null, 'brasil', '2026-04-21', 'Tiradentes'),
  (null, 'brasil', '2026-05-01', 'Dia do Trabalho'),
  (null, 'brasil', '2026-09-07', 'Independência do Brasil'),
  (null, 'brasil', '2026-10-12', 'Nossa Senhora Aparecida'),
  (null, 'brasil', '2026-11-02', 'Finados'),
  (null, 'brasil', '2026-11-15', 'Proclamação da República'),
  (null, 'brasil', '2026-11-20', 'Dia Nacional de Zumbi e da Consciência Negra'),
  (null, 'brasil', '2026-12-25', 'Natal'),
  -- 2026 (móveis)
  (null, 'brasil', '2026-02-16', 'Carnaval (segunda)'),
  (null, 'brasil', '2026-02-17', 'Carnaval (terça)'),
  (null, 'brasil', '2026-04-03', 'Sexta-feira Santa'),
  (null, 'brasil', '2026-06-04', 'Corpus Christi'),

  -- 2027 (fixos)
  (null, 'brasil', '2027-01-01', 'Confraternização Universal'),
  (null, 'brasil', '2027-04-21', 'Tiradentes'),
  (null, 'brasil', '2027-05-01', 'Dia do Trabalho'),
  (null, 'brasil', '2027-09-07', 'Independência do Brasil'),
  (null, 'brasil', '2027-10-12', 'Nossa Senhora Aparecida'),
  (null, 'brasil', '2027-11-02', 'Finados'),
  (null, 'brasil', '2027-11-15', 'Proclamação da República'),
  (null, 'brasil', '2027-11-20', 'Dia Nacional de Zumbi e da Consciência Negra'),
  (null, 'brasil', '2027-12-25', 'Natal'),
  -- 2027 (móveis)
  (null, 'brasil', '2027-02-08', 'Carnaval (segunda)'),
  (null, 'brasil', '2027-02-09', 'Carnaval (terça)'),
  (null, 'brasil', '2027-03-26', 'Sexta-feira Santa'),
  (null, 'brasil', '2027-05-27', 'Corpus Christi'),

  -- 2028 (fixos)
  (null, 'brasil', '2028-01-01', 'Confraternização Universal'),
  (null, 'brasil', '2028-04-21', 'Tiradentes'),
  (null, 'brasil', '2028-05-01', 'Dia do Trabalho'),
  (null, 'brasil', '2028-09-07', 'Independência do Brasil'),
  (null, 'brasil', '2028-10-12', 'Nossa Senhora Aparecida'),
  (null, 'brasil', '2028-11-02', 'Finados'),
  (null, 'brasil', '2028-11-15', 'Proclamação da República'),
  (null, 'brasil', '2028-11-20', 'Dia Nacional de Zumbi e da Consciência Negra'),
  (null, 'brasil', '2028-12-25', 'Natal'),
  -- 2028 (móveis — ano bissexto)
  (null, 'brasil', '2028-02-28', 'Carnaval (segunda)'),
  (null, 'brasil', '2028-02-29', 'Carnaval (terça)'),
  (null, 'brasil', '2028-04-14', 'Sexta-feira Santa'),
  (null, 'brasil', '2028-06-15', 'Corpus Christi'),

  -- 2029 (fixos)
  (null, 'brasil', '2029-01-01', 'Confraternização Universal'),
  (null, 'brasil', '2029-04-21', 'Tiradentes'),
  (null, 'brasil', '2029-05-01', 'Dia do Trabalho'),
  (null, 'brasil', '2029-09-07', 'Independência do Brasil'),
  (null, 'brasil', '2029-10-12', 'Nossa Senhora Aparecida'),
  (null, 'brasil', '2029-11-02', 'Finados'),
  (null, 'brasil', '2029-11-15', 'Proclamação da República'),
  (null, 'brasil', '2029-11-20', 'Dia Nacional de Zumbi e da Consciência Negra'),
  (null, 'brasil', '2029-12-25', 'Natal'),
  -- 2029 (móveis)
  (null, 'brasil', '2029-02-12', 'Carnaval (segunda)'),
  (null, 'brasil', '2029-02-13', 'Carnaval (terça)'),
  (null, 'brasil', '2029-03-30', 'Sexta-feira Santa'),
  (null, 'brasil', '2029-05-31', 'Corpus Christi')
on conflict (pais, data) where tenant_id is null do nothing;
