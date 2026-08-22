-- ============================================================================
-- SEED de exemplo — modulo Catalogo/Preco/Cotacao (spec-catalogo-preco-cotacao.md, Secao 11)
-- ============================================================================
-- ATENCAO: seed de DESENVOLVIMENTO/DEMO. NAO rode em producao — insere dados
-- ficticios (fornecedores, estudantes, cotacoes). Rode no SQL Editor de um
-- projeto/branch de dev, ou apos limpar as tabelas do modulo.
--
-- Idempotente: usa UUIDs fixos + ON CONFLICT DO NOTHING (e WHERE NOT EXISTS na
-- carga em massa por internal_code). Rodar duas vezes nao duplica.
--
-- Cobre a Secao 11: 2 tenants (forio, exp-tour) para teste de isolamento;
-- 3 fornecedores (connected/requested/prospect); 5 unidades (CA/IE/AU, CAD/EUR/
-- AUD, fusos corretos); por unidade 4 programas, 3 acomodacoes, 1 seguro,
-- 4 avulsos, 1 pacote; tabelas de preco em 2 anos letivos com sobreposicao e
-- ao menos uma charge_in_tiers=true; taxas (matricula/material/bancaria/
-- colocacao); 4 promocoes (percentual por mercado BR, semanas bonus, semanas
-- com desconto, isencao por janela); elegibilidade em >=2 produtos (uma com
-- grupos E/OU); 10 estudantes (nacionalidades diversas, incluindo menores com
-- contato secundario); 3 cotacoes (draft, issued com 2 opcoes, option_selected);
-- cambio CAD/EUR/AUD -> BRL.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Tenants + politica de cambio + consultor demo (owner das cotacoes)
-- ---------------------------------------------------------------------------
insert into tenant (id, name, slug, default_locale, default_presentment_currency, brand_color) values
  ('10000000-0000-0000-0000-000000000001','Forio','forio','pt-BR','BRL','#0f3d3e'),
  ('10000000-0000-0000-0000-000000000002','EXP Tour','exp-tour','pt-BR','BRL','#0f3d3e')
on conflict (id) do nothing;

insert into tenant_fx_policy (tenant_id, markup_percent, rounding_mode, rate_source, max_rate_age_hours, disclaimer) values
  ('10000000-0000-0000-0000-000000000001', 6.6000, 'none', 'manual', 72,
   'Valores em Reais sao uma estimativa pela taxa congelada na emissao e podem variar ate o pagamento.'),
  ('10000000-0000-0000-0000-000000000002', 6.6000, 'none', 'manual', 72, '')
on conflict (tenant_id) do nothing;

-- Consultor demo (dono das cotacoes; o portal mostra nome/e-mail no cartao).
insert into admin_users (email, nome, papel, ativo) values
  ('consultor.demo@yourpath.com.br','Consultor Demo','consultor', true)
on conflict (email) do nothing;

-- ---------------------------------------------------------------------------
-- Fornecedores (forio): connected/requested/prospect. So o connected tem
-- unidades e produtos cotaveis (spec 5.2).
-- ---------------------------------------------------------------------------
insert into supplier (id, tenant_id, display_name, legal_name, country_code, relationship_status, is_preferred) values
  ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Maple Language Group','Maple Language Group Inc.','CA','connected', true),
  ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','Emerald Studies','Emerald Studies Ltd.','IE','requested', false),
  ('20000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','Southern Cross Education','Southern Cross Pty','AU','prospect', false),
  ('20000000-0000-0000-0000-0000000000e1','10000000-0000-0000-0000-000000000002','Outro Fornecedor (exp-tour)',null,'CA','connected', false)
on conflict (id) do nothing;

-- Acordo comercial no fornecedor connected.
insert into supplier_agreement (id, tenant_id, supplier_id, valid_from, commission_basis, commission_type, commission_value, currency) values
  ('21000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','2025-01-01','tuition','percent',20.0000,'CAD')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Mercados (forio): BR (para promocao por mercado) e Global (default).
-- ---------------------------------------------------------------------------
insert into market (id, tenant_id, name, country_codes, is_default) values
  ('30000000-0000-0000-0000-0000000000a1','10000000-0000-0000-0000-000000000001','Global','{}', true),
  ('30000000-0000-0000-0000-0000000000b1','10000000-0000-0000-0000-000000000001','Brasil','{BR}', false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Unidades (5): Toronto/Vancouver (CA/CAD), Dublin (IE/EUR), Sydney/Perth (AU/AUD).
-- Toronto e a unidade "showcase": recebe a matriz completa e as cotacoes.
-- ---------------------------------------------------------------------------
insert into campus (id, tenant_id, supplier_id, name, country_code, city, region, timezone, base_currency, status) values
  ('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','Maple Toronto','CA','Toronto','ON','America/Toronto','CAD','active'),
  ('40000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','Maple Vancouver','CA','Vancouver','BC','America/Vancouver','CAD','active'),
  ('40000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','Maple Dublin','IE','Dublin','Leinster','Europe/Dublin','EUR','active'),
  ('40000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','Maple Sydney','AU','Sydney','NSW','Australia/Sydney','AUD','active'),
  ('40000000-0000-0000-0000-000000000005','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','Maple Perth','AU','Perth','WA','Australia/Perth','AUD','active'),
  ('40000000-0000-0000-0000-0000000000e1','10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-0000000000e1','Unidade exp-tour','CA','Montreal','QC','America/Toronto','CAD','active')
on conflict (id) do nothing;

insert into campus_settings (campus_id, units_enabled, default_unit, lesson_minutes, course_min_age) values
  ('40000000-0000-0000-0000-000000000001','{week,day}','week',50,16),
  ('40000000-0000-0000-0000-000000000002','{week}','week',50,16),
  ('40000000-0000-0000-0000-000000000003','{week}','week',60,16),
  ('40000000-0000-0000-0000-000000000004','{week}','week',60,18),
  ('40000000-0000-0000-0000-000000000005','{week}','week',60,18)
on conflict (campus_id) do nothing;

-- ===========================================================================
-- PRODUTOS — Toronto (showcase, UUIDs fixos): 4 programas, 3 acomodacoes,
-- 1 seguro, 4 avulsos, 1 pacote.
-- ===========================================================================
insert into product (id, tenant_id, campus_id, kind, name, visibility, status, default_unit, internal_code) values
  -- programas
  ('50000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','program','Ingles Geral — Toronto','quotable','active','week','tor-prog-1'),
  ('50000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','program','Ingles Intensivo — Toronto','quotable','active','week','tor-prog-2'),
  ('50000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','program','Preparatorio IELTS — Toronto','quotable','active','week','tor-prog-3'),
  ('50000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','program','Ingles para Negocios — Toronto','quotable','active','week','tor-prog-4'),
  -- acomodacoes
  ('50000000-0000-0000-0000-000000000011','10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','accommodation','Homestay quarto individual','quotable','active','week','tor-acc-1'),
  ('50000000-0000-0000-0000-000000000012','10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','accommodation','Residencia estudantil','quotable','active','week','tor-acc-2'),
  ('50000000-0000-0000-0000-000000000013','10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','accommodation','Apartamento compartilhado','quotable','active','week','tor-acc-3'),
  -- seguro
  ('50000000-0000-0000-0000-000000000021','10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','insurance','Seguro saude estudante','quotable','active','week','tor-ins-1'),
  -- avulsos
  ('50000000-0000-0000-0000-000000000031','10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','other','Transfer aeroporto','quotable','active','unit','tor-oth-1'),
  ('50000000-0000-0000-0000-000000000032','10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','other','Kit de materiais','quotable','active','unit','tor-oth-2'),
  ('50000000-0000-0000-0000-000000000033','10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','other','Atividades sociais','quotable','active','week','tor-oth-3'),
  ('50000000-0000-0000-0000-000000000034','10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','other','Guardian para menor','quotable','active','week','tor-oth-4'),
  -- pacote
  ('50000000-0000-0000-0000-000000000041','10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','package','Pacote Toronto Completo','quotable','active','week','tor-pkg-1')
on conflict (id) do nothing;

insert into program_detail (product_id, education_type, subject, language, delivery_method, lessons_per_week, hours_per_week, is_pathway) values
  ('50000000-0000-0000-0000-000000000001','language','English','English','in_person',20,15.00,false),
  ('50000000-0000-0000-0000-000000000002','language','English','English','in_person',30,22.50,false),
  ('50000000-0000-0000-0000-000000000003','exam_prep','IELTS','English','in_person',25,18.75,false),
  ('50000000-0000-0000-0000-000000000004','language','Business English','English','in_person',25,18.75,false)
on conflict (product_id) do nothing;

insert into accommodation_detail (product_id, accommodation_type, room_type, bathroom_type, meal_plan, distance_to_campus_minutes, check_in_weekday, check_out_weekday) values
  ('50000000-0000-0000-0000-000000000011','homestay','private','shared','half_board',40,0,6),
  ('50000000-0000-0000-0000-000000000012','residence','private','private','none',10,0,6),
  ('50000000-0000-0000-0000-000000000013','shared_apartment','shared_2','shared','self_catering',20,0,6)
on conflict (product_id) do nothing;

insert into insurance_detail (product_id, provider_name, coverage_summary, policy_unit, max_duration_days) values
  ('50000000-0000-0000-0000-000000000021','Guard.me','Cobertura medica basica para estudantes','week',365)
on conflict (product_id) do nothing;

insert into other_product_detail (product_id, charge_unit, category) values
  ('50000000-0000-0000-0000-000000000031','once','transfer'),
  ('50000000-0000-0000-0000-000000000032','once','material'),
  ('50000000-0000-0000-0000-000000000033','week','activities'),
  ('50000000-0000-0000-0000-000000000034','week','guardianship')
on conflict (product_id) do nothing;

insert into package (product_id, valid_from, valid_until, pricing_mode) values
  ('50000000-0000-0000-0000-000000000041','2026-01-01','2026-12-31','sum_of_items')
on conflict (product_id) do nothing;

insert into package_item (id, package_product_id, item_product_id, quantity, unit, is_optional, sort) values
  ('51000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000041','50000000-0000-0000-0000-000000000001',12,'week',false,0),
  ('51000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000041','50000000-0000-0000-0000-000000000011',12,'week',false,1),
  ('51000000-0000-0000-0000-000000000003','50000000-0000-0000-0000-000000000041','50000000-0000-0000-0000-000000000021',12,'week',true,2)
on conflict (id) do nothing;

insert into product_content (product_id, locale, description_html) values
  ('50000000-0000-0000-0000-000000000001','pt-BR','<p>Programa de ingles geral, 20 licoes/semana, foco em comunicacao.</p>'),
  ('50000000-0000-0000-0000-000000000002','pt-BR','<p>Programa intensivo, 30 licoes/semana, progressao mais rapida.</p>')
on conflict (product_id, locale) do nothing;

-- ---------------------------------------------------------------------------
-- PRODUTOS — demais 4 unidades (carga em massa por internal_code, para bater a
-- contagem da Secao 11: 4 programas + 3 acomodacoes + 1 seguro + 4 avulsos +
-- 1 pacote por unidade). Idempotente via WHERE NOT EXISTS no internal_code.
-- ---------------------------------------------------------------------------
-- Programas (4 por unidade)
insert into product (tenant_id, campus_id, kind, name, visibility, status, default_unit, internal_code)
select '10000000-0000-0000-0000-000000000001', c.id, 'program',
       'Programa '||g||' — '||c.nm, 'quotable','active','week', c.code||'-prog-'||g
from (values
  ('40000000-0000-0000-0000-000000000002','van','Vancouver'),
  ('40000000-0000-0000-0000-000000000003','dub','Dublin'),
  ('40000000-0000-0000-0000-000000000004','syd','Sydney'),
  ('40000000-0000-0000-0000-000000000005','per','Perth')
) as c(id,code,nm)
cross join generate_series(1,4) as g
where not exists (select 1 from product p where p.internal_code = c.code||'-prog-'||g);

-- Acomodacoes (3 por unidade)
insert into product (tenant_id, campus_id, kind, name, visibility, status, default_unit, internal_code)
select '10000000-0000-0000-0000-000000000001', c.id, 'accommodation',
       'Acomodacao '||g||' — '||c.nm, 'quotable','active','week', c.code||'-acc-'||g
from (values
  ('40000000-0000-0000-0000-000000000002','van','Vancouver'),
  ('40000000-0000-0000-0000-000000000003','dub','Dublin'),
  ('40000000-0000-0000-0000-000000000004','syd','Sydney'),
  ('40000000-0000-0000-0000-000000000005','per','Perth')
) as c(id,code,nm)
cross join generate_series(1,3) as g
where not exists (select 1 from product p where p.internal_code = c.code||'-acc-'||g);

-- Seguro (1 por unidade)
insert into product (tenant_id, campus_id, kind, name, visibility, status, default_unit, internal_code)
select '10000000-0000-0000-0000-000000000001', c.id, 'insurance',
       'Seguro saude — '||c.nm, 'quotable','active','week', c.code||'-ins-1'
from (values
  ('40000000-0000-0000-0000-000000000002','van','Vancouver'),
  ('40000000-0000-0000-0000-000000000003','dub','Dublin'),
  ('40000000-0000-0000-0000-000000000004','syd','Sydney'),
  ('40000000-0000-0000-0000-000000000005','per','Perth')
) as c(id,code,nm)
where not exists (select 1 from product p where p.internal_code = c.code||'-ins-1');

-- Avulsos (4 por unidade)
insert into product (tenant_id, campus_id, kind, name, visibility, status, default_unit, internal_code)
select '10000000-0000-0000-0000-000000000001', c.id, 'other',
       'Avulso '||g||' — '||c.nm, 'quotable','active','unit', c.code||'-oth-'||g
from (values
  ('40000000-0000-0000-0000-000000000002','van','Vancouver'),
  ('40000000-0000-0000-0000-000000000003','dub','Dublin'),
  ('40000000-0000-0000-0000-000000000004','syd','Sydney'),
  ('40000000-0000-0000-0000-000000000005','per','Perth')
) as c(id,code,nm)
cross join generate_series(1,4) as g
where not exists (select 1 from product p where p.internal_code = c.code||'-oth-'||g);

-- Pacote (1 por unidade)
insert into product (tenant_id, campus_id, kind, name, visibility, status, default_unit, internal_code)
select '10000000-0000-0000-0000-000000000001', c.id, 'package',
       'Pacote — '||c.nm, 'quotable','active','week', c.code||'-pkg-1'
from (values
  ('40000000-0000-0000-0000-000000000002','van','Vancouver'),
  ('40000000-0000-0000-0000-000000000003','dub','Dublin'),
  ('40000000-0000-0000-0000-000000000004','syd','Sydney'),
  ('40000000-0000-0000-0000-000000000005','per','Perth')
) as c(id,code,nm)
where not exists (select 1 from product p where p.internal_code = c.code||'-pkg-1');

-- Detalhes por vertical para a carga em massa (join pelo internal_code).
insert into program_detail (product_id, education_type, language, delivery_method, lessons_per_week, hours_per_week)
select p.id,'language','English','in_person',20,15.00 from product p
where p.tenant_id='10000000-0000-0000-0000-000000000001' and p.kind='program'
  and p.internal_code ~ '^(van|dub|syd|per)-prog-'
  and not exists (select 1 from program_detail d where d.product_id=p.id);

insert into accommodation_detail (product_id, accommodation_type, room_type, bathroom_type, meal_plan)
select p.id,'homestay','private','shared','half_board' from product p
where p.tenant_id='10000000-0000-0000-0000-000000000001' and p.kind='accommodation'
  and p.internal_code ~ '^(van|dub|syd|per)-acc-'
  and not exists (select 1 from accommodation_detail d where d.product_id=p.id);

insert into insurance_detail (product_id, provider_name, policy_unit, max_duration_days)
select p.id,'Guard.me','week',365 from product p
where p.tenant_id='10000000-0000-0000-0000-000000000001' and p.kind='insurance'
  and p.internal_code ~ '^(van|dub|syd|per)-ins-'
  and not exists (select 1 from insurance_detail d where d.product_id=p.id);

insert into other_product_detail (product_id, charge_unit, category)
select p.id,'once','service' from product p
where p.tenant_id='10000000-0000-0000-0000-000000000001' and p.kind='other'
  and p.internal_code ~ '^(van|dub|syd|per)-oth-'
  and not exists (select 1 from other_product_detail d where d.product_id=p.id);

insert into package (product_id, pricing_mode)
select p.id,'sum_of_items' from product p
where p.tenant_id='10000000-0000-0000-0000-000000000001' and p.kind='package'
  and p.internal_code ~ '^(van|dub|syd|per)-pkg-'
  and not exists (select 1 from package k where k.product_id=p.id);

-- Produto minimo no tenant exp-tour (para testes de isolamento).
insert into product (id, tenant_id, campus_id, kind, name, visibility, status, default_unit, internal_code) values
  ('50000000-0000-0000-0000-0000000000e1','10000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-0000000000e1','program','Programa exp-tour','quotable','active','week','exp-prog-1')
on conflict (id) do nothing;
insert into program_detail (product_id, education_type, language, delivery_method, lessons_per_week)
  values ('50000000-0000-0000-0000-0000000000e1','language','English','in_person',20)
on conflict (product_id) do nothing;

-- ===========================================================================
-- TABELAS DE PRECO — Toronto: dois anos letivos com SOBREPOSICAO proposital
-- (2025-08-01..2026-07-31 e 2026-01-01..2026-12-31) + uma charge_in_tiers=true.
-- ===========================================================================
insert into price_template (id, tenant_id, campus_id, name, price_basis, duration_type, unit, currency, min_quantity, max_quantity, charge_in_tiers, market_id, valid_from, valid_until, status) values
  ('60000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','Tuition Toronto 2025/26','duration','flexible','week','CAD',1,52,false,'30000000-0000-0000-0000-0000000000a1','2025-08-01','2026-07-31','active'),
  ('60000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','Tuition Toronto 2026','duration','flexible','week','CAD',1,52,false,'30000000-0000-0000-0000-0000000000a1','2026-01-01','2026-12-31','active'),
  ('60000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','Acomodacao Toronto (por faixa)','duration','flexible','week','CAD',1,52,true,'30000000-0000-0000-0000-0000000000a1','2026-01-01','2026-12-31','active')
on conflict (id) do nothing;

-- Faixas (3) — flat por bracket no template 2025/26: 10 semanas x 400 = 4.000 (criterio de aceite Marco 3).
insert into price_tier (id, price_template_id, min_quantity, unit_price, sort) values
  ('61000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001',1,400.00,0),
  ('61000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-000000000001',12,380.00,1),
  ('61000000-0000-0000-0000-000000000003','60000000-0000-0000-0000-000000000001',24,360.00,2),
  ('61000000-0000-0000-0000-000000000011','60000000-0000-0000-0000-000000000002',1,410.00,0),
  ('61000000-0000-0000-0000-000000000012','60000000-0000-0000-0000-000000000002',12,390.00,1),
  ('61000000-0000-0000-0000-000000000013','60000000-0000-0000-0000-000000000002',24,370.00,2),
  -- charge_in_tiers=true (acomodacao): cobra cada faixa na sua parcela.
  ('61000000-0000-0000-0000-000000000021','60000000-0000-0000-0000-000000000003',1,300.00,0),
  ('61000000-0000-0000-0000-000000000022','60000000-0000-0000-0000-000000000003',12,270.00,1)
on conflict (id) do nothing;

-- Vincula templates aos produtos (programas -> tuition; acomodacoes -> acc).
insert into price_template_product (price_template_id, product_id) values
  ('60000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001'),
  ('60000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000002'),
  ('60000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000003'),
  ('60000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000004'),
  ('60000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000001'),
  ('60000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000002'),
  ('60000000-0000-0000-0000-000000000003','50000000-0000-0000-0000-000000000011'),
  ('60000000-0000-0000-0000-000000000003','50000000-0000-0000-0000-000000000012'),
  ('60000000-0000-0000-0000-000000000003','50000000-0000-0000-0000-000000000013')
on conflict do nothing;

-- Regra de transicao (Toronto): dividir por periodo quando a vigencia muda no meio.
insert into price_transition_rule (id, tenant_id, campus_id, strategy, applies_to_kind) values
  ('62000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','split_by_period','program')
on conflict (id) do nothing;

-- Tabela de preco simples para as demais unidades (uma por unidade, moeda correta).
insert into price_template (id, tenant_id, campus_id, name, price_basis, unit, currency, min_quantity, max_quantity, charge_in_tiers, valid_from, valid_until, status)
select ('60000000-0000-0000-0000-0000000001'|| lpad((row_number() over (order by c.id))::text,2,'0'))::uuid,
       '10000000-0000-0000-0000-000000000001', c.id, 'Tuition '||c.nm||' 2026','duration','week',c.cur,1,52,false,'2026-01-01','2026-12-31','active'
from (values
  ('40000000-0000-0000-0000-000000000002','CAD','Vancouver'),
  ('40000000-0000-0000-0000-000000000003','EUR','Dublin'),
  ('40000000-0000-0000-0000-000000000004','AUD','Sydney'),
  ('40000000-0000-0000-0000-000000000005','AUD','Perth')
) as c(id,cur,nm)
where not exists (
  select 1 from price_template t where t.campus_id=c.id and t.name='Tuition '||c.nm||' 2026'
);

-- ===========================================================================
-- TAXAS (Toronto): matricula, material, bancaria, colocacao.
-- ===========================================================================
insert into fee (id, tenant_id, campus_id, name, fee_type, charge_basis, amount, currency, is_refundable, is_mandatory, applies_to_kinds) values
  ('70000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','Taxa de matricula','registration','once_per_quote',150.00,'CAD',false,true,'{program}'),
  ('70000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','Material didatico','material','once_per_item',80.00,'CAD',false,true,'{program}'),
  ('70000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','Taxa bancaria','bank','once_per_quote',45.00,'CAD',false,true,'{}'),
  ('70000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','Colocacao de acomodacao','placement','once_per_item',200.00,'CAD',false,true,'{accommodation}')
on conflict (id) do nothing;

-- ===========================================================================
-- PROMOCOES (4): percentual por mercado BR, semanas bonus, semanas com desconto,
-- isencao de taxa por janela.
-- ===========================================================================
insert into promotion (id, tenant_id, campus_id, supplier_id, name, promo_type, value, free_units_semantics, applies_to, applies_to_ref_id, min_quantity, is_stackable, priority, booking_from, booking_until, status) values
  ('80000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','10% Brasil','percent_off',10.0000,null,'tuition',null,null,false,10,null,null,'active'),
  ('80000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','Semanas bonus (8+)','free_units',1.0000,'bonus_on_top','tuition',null,8,false,20,null,null,'active'),
  ('80000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','Semanas com desconto (12+)','free_units',2.0000,'discount_on_booked','tuition',null,12,false,30,null,null,'active'),
  ('80000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','Isencao de matricula (janela)','waive_fee',null,null,'specific_fee','70000000-0000-0000-0000-000000000001',null,false,40,'2026-01-01','2026-03-31','active')
on conflict (id) do nothing;

-- Alvos: a promocao percentual so vale para o mercado BR (dimensao market OU nacionalidade).
insert into promotion_target (id, promotion_id, dimension, value) values
  ('81000000-0000-0000-0000-000000000001','80000000-0000-0000-0000-000000000001','market','30000000-0000-0000-0000-0000000000b1'),
  ('81000000-0000-0000-0000-000000000002','80000000-0000-0000-0000-000000000001','nationality','BR')
on conflict (id) do nothing;

-- ===========================================================================
-- ELEGIBILIDADE (>=2 produtos; uma com grupos E/OU).
--  prog-1: grupo 0 = (idade>=18 E nivel in [B1,B2,C1]); grupo 1 = (idade 16-17 E tem visto).
--          grupos diferentes combinam com OU; regras no mesmo grupo com E.
--  prog-3 (IELTS): regra unica de nivel minimo (nao bloqueante).
-- ===========================================================================
insert into eligibility_rule (id, tenant_id, product_id, group_index, attribute, operator, value, is_blocking) values
  ('a1000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001',0,'age_at_start','gte','18',true),
  ('a1000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001',0,'language_level','in','["B1","B2","C1"]',false),
  ('a1000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001',1,'age_at_start','between','[16,17]',true),
  ('a1000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001',1,'has_visa','eq','true',true),
  ('a1000000-0000-0000-0000-000000000005','10000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000003',0,'language_level','in','["B1","B2","C1"]',false)
on conflict (id) do nothing;

-- ===========================================================================
-- ESTUDANTES (10, nacionalidades diversas; 2 menores com contato secundario).
-- ===========================================================================
insert into student (id, tenant_id, first_name, last_name, email, nationality_code, residence_country_code, birth_date, language_level, onshore_status, status, owner_user_id) values
  ('90000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Ana','Souza','ana.souza@example.com','BR','BR','2000-04-12','B2','offshore','active',(select id from admin_users where email='consultor.demo@yourpath.com.br')),
  ('90000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','Bruno','Lima','bruno.lima@example.com','BR','BR','1998-09-03','B1','offshore','active',(select id from admin_users where email='consultor.demo@yourpath.com.br')),
  ('90000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','Camila','Torres','camila.torres@example.com','AR','AR','1995-01-20','C1','offshore','active',(select id from admin_users where email='consultor.demo@yourpath.com.br')),
  ('90000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000001','Diego','Fernandez','diego.f@example.com','MX','MX','2001-07-07','B2','offshore','lead',(select id from admin_users where email='consultor.demo@yourpath.com.br')),
  ('90000000-0000-0000-0000-000000000005','10000000-0000-0000-0000-000000000001','Elena','Rossi','elena.rossi@example.com','IT','IT','1999-11-30','B1','offshore','lead',null),
  ('90000000-0000-0000-0000-000000000006','10000000-0000-0000-0000-000000000001','Kenji','Tanaka','kenji.tanaka@example.com','JP','JP','1997-02-14','A2','offshore','lead',null),
  ('90000000-0000-0000-0000-000000000007','10000000-0000-0000-0000-000000000001','Marie','Dubois','marie.dubois@example.com','FR','FR','1996-06-18','B2','offshore','lead',null),
  ('90000000-0000-0000-0000-000000000008','10000000-0000-0000-0000-000000000001','Wei','Chen','wei.chen@example.com','CN','CN','2002-03-25','B1','offshore','lead',null),
  -- menores (com contato secundario)
  ('90000000-0000-0000-0000-000000000009','10000000-0000-0000-0000-000000000001','Lucas','Pereira','lucas.pereira@example.com','BR','BR','2011-05-10','A2','offshore','active',(select id from admin_users where email='consultor.demo@yourpath.com.br')),
  ('90000000-0000-0000-0000-000000000010','10000000-0000-0000-0000-000000000001','Sofia','Garcia','sofia.garcia@example.com','ES','ES','2012-08-22','A1','offshore','lead',null)
on conflict (id) do nothing;

insert into student_contact (id, tenant_id, student_id, relationship, name, email, phone, is_payer) values
  ('91000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000009','parent','Marcos Pereira','marcos.pereira@example.com','+55 11 99999-0009',true),
  ('91000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000010','guardian','Isabel Garcia','isabel.garcia@example.com','+34 600 000 010',true)
on conflict (id) do nothing;

-- Estudante no exp-tour (isolamento).
insert into student (id, tenant_id, first_name, last_name, email, nationality_code, status) values
  ('90000000-0000-0000-0000-0000000000e1','10000000-0000-0000-0000-000000000002','Outro','Estudante','outro@example.com','BR','lead')
on conflict (id) do nothing;

-- ===========================================================================
-- COTACOES (3): draft, issued (2 opcoes), option_selected. Owner = consultor demo.
-- Valores em CAD; a issued/selected trazem o cambio CONGELADO (CAD->BRL 4,20).
-- ===========================================================================
-- Quote 1 — DRAFT (1 opcao, programa 10 semanas + acomodacao).
insert into quote (id, tenant_id, reference, student_id, owner_user_id, locale, source_currency, presentment_currency, status, student_context) values
  ('c0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','2026-1','90000000-0000-0000-0000-000000000001',(select id from admin_users where email='consultor.demo@yourpath.com.br'),'pt-BR','CAD','BRL','draft','{"nationalityCode":"BR"}')
on conflict (id) do nothing;
insert into quote_option (id, tenant_id, quote_id, label, sort, is_recommended) values
  ('c1000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001','Opcao unica',0,true)
on conflict (id) do nothing;
insert into quote_item (id, tenant_id, quote_option_id, "group", product_id, campus_id, product_snapshot, start_date, end_date, quantity, delivered_quantity, unit, unit_price, gross_amount, currency, price_breakdown, sort) values
  ('c2000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001','program','50000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','{"name":"Ingles Geral — Toronto"}','2026-02-02','2026-04-13',10,10,'week',400.00,4000.00,'CAD','{}',0),
  ('c2000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001','accommodation','50000000-0000-0000-0000-000000000011','40000000-0000-0000-0000-000000000001','{"name":"Homestay quarto individual"}','2026-02-02','2026-04-13',10,10,'week',300.00,3000.00,'CAD','{}',1)
on conflict (id) do nothing;
insert into quote_item_fee (id, tenant_id, quote_item_id, fee_id, name, amount, currency, is_refundable, basis) values
  ('c3000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','c2000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','Taxa de matricula',150.00,'CAD',false,'once_per_quote')
on conflict (id) do nothing;

-- Quote 2 — ISSUED, 2 opcoes, cambio congelado. Token publico valido (43 chars).
insert into quote (id, tenant_id, reference, student_id, owner_user_id, locale, source_currency, presentment_currency, fx_rate, fx_rate_at, fx_source, fx_markup_percent, issue_date, valid_until, status, public_token, student_context) values
  ('c0000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','2026-2','90000000-0000-0000-0000-000000000002',(select id from admin_users where email='consultor.demo@yourpath.com.br'),'pt-BR','CAD','BRL',4.20000000, now(), 'seed', 6.6000,'2026-08-01','2026-12-31','issued', rpad('q2seed',43,'A'),'{"nationalityCode":"BR"}')
on conflict (id) do nothing;
insert into quote_option (id, tenant_id, quote_id, label, sort, is_recommended) values
  ('c1000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000002','Ingles Geral — 12 semanas',0,false),
  ('c1000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000002','Intensivo + acomodacao — 12 semanas',1,true)
on conflict (id) do nothing;
insert into quote_item (id, tenant_id, quote_option_id, "group", product_id, campus_id, product_snapshot, start_date, end_date, quantity, delivered_quantity, unit, unit_price, gross_amount, currency, price_breakdown, sort) values
  ('c2000000-0000-0000-0000-000000000010','10000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000002','program','50000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','{"name":"Ingles Geral — Toronto"}','2026-09-07','2026-11-29',12,12,'week',380.00,4560.00,'CAD','{}',0),
  ('c2000000-0000-0000-0000-000000000011','10000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000003','program','50000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000001','{"name":"Ingles Intensivo — Toronto"}','2026-09-07','2026-11-29',12,12,'week',420.00,5040.00,'CAD','{}',0),
  ('c2000000-0000-0000-0000-000000000012','10000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000003','accommodation','50000000-0000-0000-0000-000000000012','40000000-0000-0000-0000-000000000001','{"name":"Residencia estudantil"}','2026-09-07','2026-11-29',12,12,'week',270.00,3240.00,'CAD','{}',1)
on conflict (id) do nothing;
insert into quote_discount (id, tenant_id, quote_option_id, quote_item_id, promotion_id, name, discount_type, value, applies_to, amount, currency, is_manual) values
  ('c4000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000003',null,'80000000-0000-0000-0000-000000000001','10% Brasil','percent',10.0000,'tuition',504.00,'CAD',false)
on conflict (id) do nothing;
insert into quote_event (id, tenant_id, quote_id, kind, actor_type, metadata) values
  ('c5000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000002','issued','user','{"source":"CAD","presentment":"BRL"}')
on conflict (id) do nothing;

-- Quote 3 — OPTION_SELECTED (issued + escolha registrada).
insert into quote (id, tenant_id, reference, student_id, owner_user_id, locale, source_currency, presentment_currency, fx_rate, fx_rate_at, fx_source, fx_markup_percent, issue_date, valid_until, status, public_token, selected_option_id, student_context) values
  ('c0000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','2026-3','90000000-0000-0000-0000-000000000003',(select id from admin_users where email='consultor.demo@yourpath.com.br'),'pt-BR','CAD','BRL',4.20000000, now(), 'seed', 6.6000,'2026-07-15','2026-11-30','option_selected', rpad('q3seed',43,'A'),'c1000000-0000-0000-0000-000000000004','{"nationalityCode":"AR"}')
on conflict (id) do nothing;
insert into quote_option (id, tenant_id, quote_id, label, sort, is_recommended, selected_at) values
  ('c1000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000003','Preparatorio IELTS — 8 semanas',0,true, now())
on conflict (id) do nothing;
insert into quote_item (id, tenant_id, quote_option_id, "group", product_id, campus_id, product_snapshot, start_date, end_date, quantity, delivered_quantity, unit, unit_price, gross_amount, currency, price_breakdown, sort) values
  ('c2000000-0000-0000-0000-000000000020','10000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000004','program','50000000-0000-0000-0000-000000000003','40000000-0000-0000-0000-000000000001','{"name":"Preparatorio IELTS — Toronto"}','2026-08-03','2026-09-25',8,8,'week',400.00,3200.00,'CAD','{}',0)
on conflict (id) do nothing;
insert into quote_event (id, tenant_id, quote_id, kind, actor_type, metadata) values
  ('c5000000-0000-0000-0000-000000000010','10000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000003','issued','user','{}'),
  ('c5000000-0000-0000-0000-000000000011','10000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000003','opened','student','{}'),
  ('c5000000-0000-0000-0000-000000000012','10000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000003','option_selected','student','{"optionIndex":0}')
on conflict (id) do nothing;

-- ===========================================================================
-- CAMBIO (fx_rate global): CAD/EUR/AUD -> BRL. effective_at = agora (fresco).
-- ===========================================================================
insert into fx_rate (id, base_currency, quote_currency, rate, source, effective_at) values
  ('f0000000-0000-0000-0000-000000000001','CAD','BRL',3.9400,'seed', now()),
  ('f0000000-0000-0000-0000-000000000002','EUR','BRL',5.9200,'seed', now()),
  ('f0000000-0000-0000-0000-000000000003','AUD','BRL',3.5800,'seed', now())
on conflict (id) do nothing;

commit;

-- ============================================================================
-- Conferencia rapida (opcional): descomente para ver as contagens por tenant.
-- select 'produtos forio' as o, count(*) from product where tenant_id='10000000-0000-0000-0000-000000000001'
-- union all select 'cotacoes', count(*) from quote where tenant_id='10000000-0000-0000-0000-000000000001';
-- ============================================================================
