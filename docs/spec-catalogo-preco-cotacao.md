> **Nota de adaptação (ler antes) — ver `docs/decisions.md`, ADR-001.**
> Esta spec descreve, na origem, uma plataforma multi-tenant estilo Edvisor com
> Supabase Auth e RLS por políticas. A decisão vigente (ADR-001) é implementar o
> módulo **no mesmo repositório, com as convenções do portal atual**. Portanto,
> onde a spec disser:
> - **Supabase Auth / `membership` / `app_user`** → usamos a auth já existente
>   (sessão HMAC em cookie; admin por `admin_users` + `admin-roles`). Não há
>   Supabase Auth neste projeto.
> - **RLS por políticas com `auth.current_tenant_ids()`** → usamos **RLS
>   habilitado sem policies + autorização em código (service role nas rotas)**,
>   como as demais tabelas. A permissão por papel vive em `admin-roles`/guardas.
> - **Multi-tenant** → **single-tenant hoje**, mas toda tabela nova nasce com
>   `tenant_id uuid` (default do tenant atual) para o multi-tenant futuro não
>   exigir reescrita.
> - **Idioma:** identificadores/tabelas/colunas/enums em **inglês**; comentários,
>   erros e conteúdo ao usuário em **português**.
>
> O **modelo de dados, o motor de preço, as máquinas de estado, os contratos de
> serviço e as telas** valem como fonte de verdade. O motor de preço já está
> implementado em `src/lib/pricing.ts` (Marco 2, casos T1–T8 verdes).

---

# Forio — Especificação técnica: Catálogo, Preço e Cotação
**Versão:** 1.0 · 21 de agosto de 2026
**Autor da especificação:** análise da plataforma Edvisor + modelagem de domínio
**Destinatário:** agente de desenvolvimento (Claude Code) e time técnico da PATH
**Stack alvo:** Next.js (App Router, TypeScript) + Supabase (Postgres, Storage) + Vercel
**Escopo desta entrega:** Fases 1 e 2 — fornecedores, unidades, catálogo, motor de preço, promoções, elegibilidade, construtor de cotação e portal do estudante.

---
## 0. Como usar este documento
Este é um documento de especificação, não um roteiro de conversa. A ordem de leitura para quem vai implementar é: seção 2 (decisões de arquitetura), seção 3 (modelo de dados), seção 4 (motor de preço), depois o resto.

**Instruções para o agente de desenvolvimento:**
1. Mantenha este arquivo como fonte de verdade do módulo. Quando encontrar ambiguidade, registre a decisão tomada em `docs/decisions.md` no formato ADR curto (contexto, decisão, consequência) em vez de decidir silenciosamente.
2. **Comece pelo motor de preço, com testes antes do código.** A seção 4.6 contém sete casos de teste com números fechados. (JÁ FEITO: `src/lib/pricing.ts` + `src/lib/pricing.test.ts`.)
3. Implemente na ordem dos marcos da seção 12. Não pule para a interface antes do schema e do motor estarem verdes.
4. Toda regra de negócio desta especificação deve existir como função pura testável, separada da camada de banco e da camada de interface.
5. Não invente campos. Se um campo parecer necessário e não estiver aqui, adicione-o e registre em `docs/decisions.md`.
6. Idioma: identificadores, tabelas, colunas, enums e código em inglês. Interface e conteúdo para o usuário final em português do Brasil, com estrutura pronta para inglês e espanhol.

**O que este documento deliberadamente não cobre:** CRM completo, pipelines, venda, contas a receber, aplicações para escolas, portal do fornecedor com autogestão, relatórios e integrações de pagamento. Todos estão previstos na arquitetura (ver seção 13) mas ficam fora da implementação atual.

---
## 1. Escopo funcional
### 1.1 Dentro do escopo
Um consultor da Forio deve conseguir, ao final desta entrega:
1. Cadastrar um fornecedor e suas unidades, com configurações operacionais por unidade.
2. Cadastrar programas, acomodações, seguros e produtos avulsos, com atributos estruturados e conteúdo multilíngue.
3. Criar tabelas de preço versionadas com faixas por duração e vinculá-las a vários produtos.
4. Criar taxas e vinculá-las a produtos ou à unidade.
5. Criar promoções segmentadas por mercado, nacionalidade, unidade e produto, com janela de reserva e de viagem.
6. Definir regras de elegibilidade por produto.
7. Buscar produtos no catálogo interno, filtrando por contexto do estudante.
8. Montar uma cotação com múltiplas opções comparáveis, cada uma com programa, acomodação, seguro, produtos avulsos, taxas e descontos.
9. Ver a cotação calculada em moeda de origem e em BRL, com taxa de câmbio registrada.
10. Definir entrada e plano de parcelamento por opção.
11. Emitir a cotação, gerando um link público com token.
12. Acompanhar quando o estudante abriu a cotação e qual opção escolheu.

O estudante deve conseguir abrir o link sem login, comparar opções, ver detalhe de cada item, baixar em PDF e escolher uma opção.

### 1.2 Fora do escopo desta entrega
Aplicações e matrículas; venda e contas a receber; gateways de pagamento; portal de autogestão do fornecedor; CRM com pipelines e tarefas; captação de leads; relatórios analíticos; integração com WhatsApp. As tabelas e enums que esses módulos exigirão estão previstos no schema onde isso custa pouco agora e caro depois, e estão marcados como tal.

---
## 2. Decisões de arquitetura
> As seções 2.1 e 2.2 abaixo são **substituídas pela adaptação (ADR-001)** — mantidas aqui como origem/histórico. Valem para este projeto: 2.3 (dinheiro/câmbio), 2.4 (datas), 2.5 (i18n), 2.6 (exclusão/auditoria/LGPD — usando `admin_audit`), 2.7 (estrutura, adaptada a `src/lib`).

### 2.1 Multi-tenancy — [SUBSTITUÍDA: single-tenant + coluna tenant_id, sem RLS por políticas; ver ADR-001]
Origem da spec: uma base Postgres, coluna `tenant_id` em toda tabela de negócio, isolamento por Row Level Security por políticas com `auth.current_tenant_ids()`. **Na adaptação:** mantemos `tenant_id` em toda tabela nova (isolamento futuro), RLS habilitado **sem** policies, autorização em código com service role. Um tenant fixo hoje; `tenants` cadastra EXP Tour e Forio para o FK.

### 2.2 Autenticação — [SUBSTITUÍDA: sem Supabase Auth; ver ADR-001]
Origem: Supabase Auth (e-mail/senha + magic link), `app_user` espelho de `auth.users`, `membership` define tenant e papel. **Na adaptação:** a auth já existente do portal (cliente por CPF+código; admin por código de e-mail em `admin_users` com papel). O portal do estudante continua **sem Auth**, por token opaco na URL (isto a spec e a adaptação concordam).

### 2.3 Dinheiro, moeda e câmbio
- Todo valor monetário é `numeric(14,2)`. Nunca `float`.
- Toda coluna de valor tem uma coluna de moeda ao lado, ou herda a moeda declarada explicitamente na tabela pai. Nunca existe valor sem moeda identificável.
- **Moeda de origem** (`source_currency`) é a moeda em que o fornecedor precifica, definida na unidade.
- **Moeda de apresentação** (`presentment_currency`) é a moeda em que a cotação é mostrada ao estudante, normalmente BRL.
- A conversão usa uma taxa **congelada no momento da emissão** da cotação, gravada em `quote.fx_rate`, `quote.fx_rate_at` e `quote.fx_source`. Cotação emitida nunca muda de valor porque o câmbio mudou.
- A política de câmbio do tenant (`tenant_fx_policy`) define spread aplicado sobre a taxa de referência, arredondamento e o texto de ressalva exibido ao estudante.
- Arredondamento: cada linha é arredondada a duas casas com `round half away from zero`; o total é a soma das linhas arredondadas, nunca o arredondamento da soma. (Implementado em `pricing.round2`/`sumMoney`.)

### 2.4 Datas
- Datas de programa, acomodação e vigência de preço são `date`, **sem fuso horário**. Uma aula que começa em 15 de junho começa em 15 de junho em qualquer lugar do mundo.
- Carimbos de evento (`created_at`, `viewed_at`, `issued_at`) são `timestamptz` em UTC.
- Cálculo de semanas: uma semana são 7 dias corridos. Duração em semanas de um período `[start, end]` é `(end - start + 1) / 7`. Programas são vendidos em semanas inteiras; a data de término é derivada da data de início mais a duração, e é campo calculado, não digitado.

### 2.5 Internacionalização
- Locales suportados na v1: `pt-BR` (padrão), `en`, `es`.
- Conteúdo traduzível vive em tabelas `*_content` com chave composta `(parent_id, locale)`.
- Cada linha de conteúdo tem `is_machine_translated boolean`. Tradução automática preenche e marca; edição manual desmarca. A interface deve mostrar o selo de conteúdo traduzido automaticamente.
- Fallback de leitura: locale pedido, depois `en`, depois o primeiro disponível.

### 2.6 Exclusão, auditoria e LGPD
- **Exclusão lógica** em todas as entidades de negócio: `archived_at timestamptz`. Exclusão física só por rotina administrativa.
- **Trilha de auditoria** (usar a `admin_audit` existente, ou `audit_log` conforme a spec) gravada em: preço, taxa, promoção, produto, cotação e configuração de unidade. Registra tabela, id, operação, autor, diff em `jsonb`, timestamp.
- **LGPD:** `student` e `student_contact` contêm dado pessoal. Implementar: exportação completa dos dados de um estudante em JSON, anonimização (substituição de nome, e-mail, telefone e documento por marcadores, preservando os agregados), e `data_retention_policy` no tenant com prazo padrão. Registrar base legal e consentimento em `student.consent` (`jsonb`).

### 2.7 Estrutura do projeto (adaptada a este repo)
```
/src/app/admin/...              área autenticada (admin do portal)
/src/app/(public)/p/[token]/    portal do estudante (sem auth)
/src/app/api/...                rotas de serviço
/src/lib/pricing.ts             motor de preço (funções puras, sem I/O) — FEITO
/src/lib/...                    demais helpers puros e integrações
/supabase/schema.sql            schema de referência (atualizar ao aplicar DDL)
/docs                           spec-catalogo-preco-cotacao.md, decisions.md
```
Regra: o motor de preço não importa nada de banco, `next` ou Supabase. Recebe objetos simples e devolve objetos simples.

---
## 3. Modelo de dados
Notação: `PK` chave primária, `FK` chave estrangeira, `!` obrigatório, `?` opcional. Todas as tabelas de negócio têm `id uuid primary key default gen_random_uuid()`, `tenant_id`, `created_at timestamptz not null default now()`, `updated_at timestamptz`, `archived_at timestamptz?`. Essas colunas não são repetidas abaixo.

### 3.1 Tenant e identidade
**`tenant`** — `name !` ("Forio", "EXP Tour"), `slug ! unique`, `default_locale !` (`pt-BR`), `default_presentment_currency char(3) !` (`BRL`), `logo_url ?`, `brand_color ?`, `contact_email/contact_phone/website/address ?`.

**`tenant_fx_policy`** (`tenant_id` PK) — `markup_percent numeric(6,4) ! default 0`, `rounding_mode enum(none,up_1,up_10,up_100) !`, `rate_source text !`, `max_rate_age_hours int ! default 24`, `disclaimer text !`.

> `app_user` e `membership` da spec original **não se aplicam** (sem Supabase Auth; ver ADR-001). O portal usa `admin_users` (com papel) para o staff.

### 3.2 Fornecedor e unidade
**`supplier`** — `display_name !`, `legal_name ?`, `country_code ?`, `website ?`, `logo_url ?`, `relationship_status enum !` = `prospect | requested | connected | paused | declined | disconnected`, `is_preferred boolean ! default false`, `verified_at ?`, `internal_notes ?`, `owner_user_id ?`.

**`supplier_group`** `name !` · **`supplier_group_member`** `(supplier_group_id, supplier_id)` PK.

**`supplier_agreement`** — condição comercial vigente (a comissão precisa estar disponível no cálculo desde o início). `supplier_id !`, `valid_from date !`, `valid_until date ?`, `commission_basis enum !` = `tuition | tuition_plus_fees | total | none`, `commission_type enum !` = `percent | fixed_per_sale | fixed_per_week`, `commission_value numeric(14,4) !`, `currency char(3) ?`, `payment_terms ?`, `document_url ?`, `notes ?`.

**`campus`** — a unidade operacional (nome genérico; servirá também para hotel/operador). `supplier_id !`, `name !`, `country_code !`, `region ?`, `city !`, `address ?`, `postal_code ?`, `latitude ?`, `longitude ?`, `timezone !`, `base_currency char(3) !`, `phone/email/website/logo_url/cover_image_url ?`, `status enum !` = `draft | active | inactive`.

**`campus_settings`** (`campus_id` PK) — `units_enabled text[] !` (subconjunto de `week, day, night, lesson, month, semester, term, session, person, unit`), `lesson_minutes int ?` (obrigatório se `lesson`), `course_min_age/course_max_age int ?`, `course_min_duration/course_max_duration int ?`, `course_language_level_required text ?`, `accommodation_min_age/accommodation_max_age int ?`, `accommodation_min_duration/accommodation_max_duration int ?`, `accommodation_checkout_weekday int ? 0-6`, `multi_course_fee_rule enum !` = `charge_highest | charge_lowest | charge_all`, `default_unit text !` (`week`).

**`campus_content`** (`(campus_id, locale)` PK) — `highlights jsonb ?`, `highlights_footer ?`, `description_html ?`, `is_machine_translated boolean ! default false`.

**`campus_media`** `campus_id !`, `url !`, `kind enum` = `photo | video | brochure`, `sort int`, `caption ?`.

**`campus_document`** (`(campus_id, locale, kind)` unique) — `kind enum !` = `terms_and_conditions | payment_refund_policy | application_instructions`, `body_html !`, `version int !`, `published_at ?`.

**`campus_calendar_entry`** — `campus_id !`, `kind enum !` = `course_start | accommodation_arrival | holiday | closure`, `date date !`, `label ?`, `applies_to_product_ids uuid[] ?` (vazio = todos). Índice `(campus_id, kind, date)`.

### 3.3 Mercados
**`market`** — agrupamento nomeado de origem, usado em preço e promoção. `name !`, `country_codes char(2)[] !`, `is_default boolean`.
Resolução: dado o `nationality_code` do estudante, o mercado aplicável é o primeiro `market` que contém o código; se nenhum, usa o `is_default`; se não houver, o preço sem mercado.

### 3.4 Produtos
**`product`** — tabela única com discriminador. `campus_id ! FK`, `kind enum !` = `program | accommodation | insurance | other | package`, `name !`, `internal_code ?`, `source enum !` = `internal | supplier`, `visibility enum !` = `hidden | internal | quotable | sellable`, `status enum !` = `draft | active | inactive`, `default_unit text !`, `min_duration/max_duration int ?`, `available_from/available_until date ?`, `attributes jsonb ! default '{}'` (validado contra `product_type_schema`), `created_by_user_id ?`. Índices `(tenant_id, campus_id, kind, status)`, GIN em `attributes`.

**`product_type_schema`** — permite tipos sem migração. `kind !`, `key !` (ex.: `high_school`), `label !`, `json_schema jsonb !`, `search_facets text[] !`.

**`program_detail`** (`product_id` PK) — `education_type ?`, `subject ?`, `language ?`, `delivery_method enum ?` = `in_person | online | hybrid`, `format ?`, `institution_type ?`, `grades text[] ?`, `lessons_per_week int ?`, `hours_per_week numeric(5,2) ?`, `is_pathway boolean`, `includes_activities boolean`, `timetable jsonb ?`.

**`accommodation_detail`** (`product_id` PK) — `accommodation_type enum ?` = `homestay | residence | shared_apartment | studio | hotel | other`, `room_type enum ?` = `private | shared_2 | shared_3plus`, `bathroom_type enum ?` = `private | shared`, `meal_plan enum ?` = `none | breakfast | half_board | full_board | self_catering`, `distance_to_campus_minutes int ?`, `check_in_weekday int ?`, `check_out_weekday int ?`.

**`insurance_detail`** (`product_id` PK) — `provider_name ?`, `coverage_summary ?`, `policy_unit enum` = `day | week | month`, `max_duration_days int ?`.

**`other_product_detail`** (`product_id` PK) — `charge_unit enum !` = `once | day | night | week | person | unit`, `category ?`.

**`package`** (`product_id` PK) — `valid_from/valid_until date ?`, `pricing_mode enum !` = `sum_of_items | fixed_price`.
**`package_item`** — `package_product_id !`, `item_product_id !`, `quantity ?`, `unit ?`, `is_optional boolean`, `sort`.

**`product_content`** (`(product_id, locale)` PK) — `description_html ?`, `highlights jsonb ?`, `inclusions jsonb ?`, `exclusions jsonb ?`, `is_machine_translated boolean !`.
**`product_media`** — `product_id !`, `url !`, `kind`, `sort`, `caption ?`.

### 3.5 Elegibilidade
**`eligibility_rule`** — `product_id !`, `group_index int ! default 0`, `attribute enum !`, `operator enum !`, `value jsonb !`, `is_blocking boolean ! default false`.
- `attribute`: `age_at_start`, `nationality`, `residence_country`, `language_level`, `education_level`, `onshore_status`, `has_visa`.
- `operator`: `between`, `in`, `not_in`, `gte`, `lte`, `eq`.
- Semântica: mesmo `group_index` combina com **E**; grupos diferentes com **OU**. Produto sem regra é elegível para todos.

### 3.6 Preço
**`price_template`** — `campus_id !`, `name !`, `price_basis enum !` = `duration | quantity | fixed | per_person`, `duration_type enum !` = `flexible | fixed_sessions`, `unit text !` (em `campus_settings.units_enabled`), `currency char(3) !`, `min_quantity/max_quantity int ?`, `charge_in_tiers boolean ! default false`, `market_id ? FK` (nulo = todos os mercados), `valid_from date !`, `valid_until date ?`, `status enum !` = `draft | active | expired` (derivado das datas). Restrição: para `(campus_id, market_id)` + conjunto de produtos, não pode haver dois templates ativos com vigências sobrepostas.

**`price_tier`** — `price_template_id !`, `min_quantity int !`, `unit_price numeric(14,2) !`, `sort int !`. Unicidade `(price_template_id, min_quantity)`; sempre existe um tier com `min_quantity` mínimo do template.

**`price_template_product`** (`(price_template_id, product_id)` PK).

**`price_transition_rule`** — `campus_id ?` (nulo = tenant), `strategy enum !`, `applies_to_kind enum ?`. `strategy`: `split_by_period` (padrão), `use_start_date_price`, `use_booking_date_price`. Resolução: campus, senão tenant, senão `split_by_period`.

**`fee`** — `campus_id !`, `name !`, `fee_type enum !` = `registration | material | bank | placement | service | courier | courier_of_documents | custom`, `charge_basis enum !` = `once_per_quote | once_per_item | per_unit | per_person`, `amount numeric(14,2) ?`, `currency char(3) ?`, `price_template_id ? FK`, `is_refundable boolean`, `is_mandatory boolean ! default true`, `applies_to_kinds text[] !`, `valid_from/valid_until date ?`. Regra: exatamente um entre `amount` e `price_template_id`.
**`fee_product`** (`(fee_id, product_id)` PK).

**`promotion`** — `campus_id ?` (nulo = todas as unidades), `supplier_id !`, `name !`, `promo_type enum !` = `percent_off | fixed_off | free_units | waive_fee | free_product | override_price`, `value numeric(14,4) ?`, `free_units_semantics enum ?` = `bonus_on_top | discount_on_booked` (obrigatório se `free_units`), `applies_to enum !` = `tuition | accommodation | insurance | fees | specific_fee | total | specific_product`, `applies_to_ref_id uuid ?`, `min_quantity int ?`, `max_discount_amount numeric(14,2) ?`, `is_stackable boolean ! default false`, `priority int ! default 100`, `booking_from/booking_until date ?`, `travel_from/travel_until date ?`, `status enum !` = `draft | active | expired`.
**`promotion_target`** — `promotion_id !`, `dimension enum !` = `market | nationality | campus | partner | product | education_type`, `value text !`. Dimensões diferentes combinam com **E**; valores na mesma dimensão com **OU**; dimensão sem alvo não restringe.

### 3.7 Estudante (mínimo para cotar)
**`student`** — `first_name !`, `last_name !`, `preferred_name ?`, `email ?`, `phone ?`, `whatsapp ?`, `birth_date date ?`, `gender ?`, `nationality_code char(2) ?`, `residence_country_code char(2) ?`, `city ?`, `language_level ?`, `education_level ?`, `passport_number ?`, `visa_country_code ?`, `visa_type ?`, `visa_expiry date ?`, `onshore_status enum ?` = `onshore | offshore`, `source ?`, `owner_user_id ?`, `consent jsonb ?`, `status enum` = `lead | active | archived`.
**`student_contact`** — `student_id !`, `relationship enum` = `parent | guardian | spouse | other`, `name !`, `email ?`, `phone ?`, `is_payer boolean`.
**`custom_field_definition`** — `entity enum !` = `student | quote | supplier`, `key !`, `label !`, `field_type enum !`, `options jsonb ?`, `sort`.
**`custom_field_value`** — `definition_id !`, `record_id !`, `value jsonb !` (unicidade `(definition_id, record_id)`).

### 3.8 Cotação
**`quote`** — `reference ! unique por tenant` (`{tenant_seq}-{ano}-{n}`), `student_id !`, `owner_user_id !`, `locale !`, `source_currency char(3) ?`, `presentment_currency char(3) !`, `fx_rate numeric(18,8) ?`, `fx_rate_at timestamptz ?`, `fx_source text ?`, `fx_markup_percent numeric(6,4) ?`, `issue_date date ?`, `valid_until date ?`, `status enum !` (ver 5.1), `public_token text ? unique` (32 bytes, base64url), `token_revoked_at timestamptz ?`, `student_context jsonb !` (fotografia do contexto do cálculo), `notes_html ?`, `selected_option_id uuid ?`.
**`quote_option`** — `quote_id !`, `label !`, `sort int !`, `deposit_amount numeric(14,2) ?`, `deposit_currency ?`, `is_recommended boolean`, `selected_at ?`.
**`quote_item`** — `quote_option_id !`, `group enum !` = `program | accommodation | insurance | other | package`, `product_id ? FK`, `campus_id ?`, `product_snapshot jsonb !` (cópia congelada), `start_date/end_date date ?`, `quantity numeric(10,2) !`, `delivered_quantity numeric(10,2) !`, `unit text !`, `unit_price numeric(14,2) !`, `gross_amount numeric(14,2) !`, `currency char(3) !`, `price_breakdown jsonb !` (ver 4.7), `sort int !`.
**`quote_item_fee`** — `quote_item_id !`, `fee_id ?`, `name !`, `amount numeric(14,2) !`, `currency !`, `is_refundable boolean`, `basis text !`.
**`quote_discount`** — `quote_option_id !`, `quote_item_id ?`, `promotion_id ?`, `name !`, `discount_type enum !` = `percent | fixed | free_units`, `value numeric(14,4) !`, `applies_to text !`, `amount numeric(14,2) !`, `currency !`, `is_manual boolean !`. Desconto manual exige `is_manual = true` e registro do autor na auditoria.
**`quote_payment_plan`** — `quote_option_id ! unique`, `installments_count int !`, `first_due_date date ?`, `method enum ?` = `pix | boleto | card | bank_transfer | mixed`, `notes ?`.
**`quote_payment_installment`** — `plan_id !`, `sequence int !`, `due_date date !`, `amount numeric(14,2) !`, `currency !`, `description ?`.
**`quote_event`** — `quote_id !`, `kind enum !` = `created | issued | sent | opened | option_viewed | downloaded | option_selected | expired | reissued`, `actor_type enum` = `user | student | system`, `actor_user_id ?`, `metadata jsonb ?`, `occurred_at timestamptz !`. Índice `(quote_id, occurred_at desc)`.
**`saved_note`** — `title !`, `body_html !`, `locale !`, `created_by_user_id`.
**`fx_rate`** — `base_currency !`, `quote_currency !`, `rate numeric(18,8) !`, `source !`, `effective_at timestamptz !`. Índice `(base_currency, quote_currency, effective_at desc)`.

---
## 4. Motor de preço  — **IMPLEMENTADO em `src/lib/pricing.ts`** (casos T1–T8 verdes em `pricing.test.ts`)
A especificação completa do motor (entradas/saída, sequência de cálculo 4.2, faixas e `charge_in_tiers` 4.3, transição 4.4, taxas/promoções/semanas grátis 4.5, casos de teste 4.6 e rastro auditável 4.7) foi implementada como funções puras. Resumo das funções: `tierFor`, `priceFlat`, `priceProgressive`, `priceTier`, `calcWithTransition` (split_by_period / use_start_date_price / use_booking_date_price, com `PriceSegment` como rastro), `applyFreeUnits` (bonus_on_top / discount_on_booked), `aggregateRegistrationFee`, `convertFx`, além de `round2`, `sumMoney`, `averageUnitPrice`, `percentOff`. Números de referência (CAD): T1 5.750,00 · T2 5.790,00 · T3 5.890,00 · T3b 5.750,00 · T4 cobrado 11.400,00 (billable 20 / delivered 24) · T5 líquido 9.120,00 (desconto 2.280,00, billable 16 / delivered 20) · T6 200/160/360 · T7 33.962,65 (médias 380,00 e 2,55) · T8 R$ 142.724,64 (rate efetiva 4,2024).

---
## 5. Máquinas de estado
### 5.1 Cotação
`draft → issued → viewed → option_selected`; ramos `expired`, `cancelled`, `converted` (futuro); `reissued` arquiva a versão anterior e gera novo token.
- `draft` é o único estado editável livremente. `issued` em diante, alteração exige **reemissão** (arquiva a anterior, novo `public_token`).
- `issued` exige: ≥1 opção, cada opção com ≥1 item, `valid_until`, taxa de câmbio válida dentro de `max_rate_age_hours`, nenhum `warning` bloqueante.
- `viewed` pelo primeiro `quote_event` `opened`. `option_selected` grava `selected_option_id` + `selected_at` e notifica o `owner_user_id`. `expired` por rotina diária quando `valid_until < hoje`. `cancelled` invalida o token.
### 5.2 Relação com fornecedor
`prospect → requested → connected → paused`; ramos `declined`, `disconnected`. Só fornecedor `connected` tem produtos elegíveis para cotação.
### 5.3 Tabela de preço
`draft → active → expired`. `active` exige `valid_from` e ≥1 faixa no `min_quantity` mínimo. `expired` derivado de `valid_until` por rotina diária; template expirado nunca é excluído (auditoria de cotações antigas).

---
## 6. Permissões
Papéis da spec: `owner, admin, consultant, finance, supplier_admin, supplier_editor, viewer`. **Na adaptação (ADR-001)** a autorização é em código; os papéis do portal hoje são `gestor, operacao, financeiro, consultor` (`admin-roles.ts`). Ao construir o módulo, mapear as capacidades da matriz da spec (ver seção 6.2 da origem) para o modelo de capacidades do portal, e garantir por código que papéis de fornecedor nunca leem `supplier_agreement`, `student`, `quote` nem dados de outro fornecedor (equivalente às políticas de RLS específicas da spec).

---
## 7. Telas e rotas
Área autenticada (adaptada a `/admin` ou a um namespace do módulo): `/suppliers`, `/suppliers/[id]`, `/campuses/[id]` (abas Sobre/Programas/Acomodações/Outros/Calendário/Termos/Configurações), `/campuses/[id]/price-templates` (+ editor), `/campuses/[id]/fees`, `/campuses/[id]/calendar`, `/products` (+ editor), `/promotions` (+ editor), `/students` (+ ficha), `/quotes` (+ `/quotes/new` assistente, `/quotes/[id]` construtor), `/settings/fx`, `/settings/team`.
Requisitos do construtor de cotação (seção 7.2 da origem): montar curso+acomodação+seguro em <3 min; busca em painel lateral já filtrada pelo contexto do estudante com preço calculado; duplicar opção em 1 clique; recálculo ao vivo com indicação da linha alterada; moeda de origem e BRL simultâneas com idade da taxa; `warnings` em linha; prévia do documento em painel; mobile para lista e prévia.

---
## 8. Contratos de serviço
Server actions/rotas com validação Zod, retornando `{ ok:true, data } | { ok:false, error:{code,message,details} }`: `searchProducts`, `priceProduct` (usa `pricing.ts`), `createQuote`, `addQuoteOption` (com `copyFromOptionId`), `addQuoteItem`, `updateQuoteItem`, `addManualDiscount`, `setPaymentPlan`, `recalculateQuote`, `issueQuote` (idempotente por `quoteId`, falha com warning bloqueante), `revokeQuoteToken`, `reissueQuote`, `getPublicQuote` (público), `recordQuoteEvent`, `selectQuoteOption`. `recalculateQuote` nunca altera cotação fora de `draft`. Toda escrita grava auditoria.

---
## 9. Portal do estudante
Rota pública `/(public)/p/[token]`, sem auth, SSR. **Segurança:** token 32 bytes base64url (CSPRNG), sem enumeração, revogável, 60 req/min por IP e por token, `noindex,nofollow`, nenhum dado do estudante além do primeiro nome, nenhum identificador interno no HTML. **Estrutura:** Início (marca, saudação, contagem de opções, cartão do consultor), Opções (cards comparáveis; abas Detalhe/Resumo financeiro; câmbio com taxa/data/ressalva; valor cheio riscado quando há desconto), Sobre, Ações (baixar PDF, compartilhar, escolher). **Comportamento:** idioma padrão `quote.locale`; registrar `opened/option_viewed/downloaded/option_selected`; escolha em 2 etapas, irreversível pelo estudante. **PDF** gerado no servidor do mesmo componente. **Desempenho** <2s em 4G.

---
## 10. Requisitos não funcionais
Mobile primeiro no portal do estudante; WCAG 2.1 AA no portal; busca de produtos <500ms para 50k produtos (índices + paginação por cursor); log estruturado com `tenant_id`/`quote_id`; alerta em falha de emissão e câmbio vencido; PITR no Supabase; cobertura obrigatória em `pricing` (FEITO); testes de isolamento (na adaptação: testes de que a autorização em código não vaza entre tenants/clientes e que papel de fornecedor não lê estudante/cotação); migrações versionadas, nunca editadas depois de aplicadas.

---
## 11. Dados de exemplo (seed)
2 tenants (`forio`, `exp-tour`); 3 fornecedores (`connected`, `requested`, `prospect`); 5 unidades (Canadá/Irlanda/Austrália, CAD/EUR/AUD, fusos corretos); por unidade 4 programas, 3 acomodações, 1 seguro, 4 avulsos, 1 pacote; tabelas de preço em dois anos letivos com sobreposição proposital e ao menos uma `charge_in_tiers = true`; taxas (matrícula, material, bancária, colocação); 4 promoções (percentual por mercado BR, semanas bônus, semanas com desconto, isenção por janela); elegibilidade em ≥2 produtos (uma com grupos E/OU); 10 estudantes com nacionalidades diferentes (incluindo menores com contato secundário); 3 cotações (`draft`, `issued` com 2 opções, `option_selected`); câmbio de CAD/EUR/AUD para BRL.

---
## 12. Marcos de implementação e critérios de aceite
- **Marco 1 — fundação.** Schema 3.1–3.3 (adaptado: `tenant` + `tenant_fx_policy` + `supplier`/`campus`/`market`), RLS habilitado sem policies + `tenant_id`. *Aceite:* tabelas criadas, seed mínimo, e a autorização em código não vaza entre tenants (teste).
- **Marco 2 — motor de preço.** **FEITO** (`pricing.ts`, T1–T8 verdes).
- **Marco 3 — catálogo.** Produtos com atributos por vertical, conteúdo multilíngue, mídia, tabelas de preço, taxas, promoções, elegibilidade + seed (seção 11). *Aceite:* criar unidade + programa + tabela com 3 faixas + taxa de matrícula, e o preço de 10 semanas na ficha bate com o cálculo manual.
- **Marco 4 — busca e construtor.** Busca contextual, assistente, opções, itens, taxas, descontos, entrada/parcelamento, recálculo ao vivo, câmbio.
- **Marco 5 — emissão e portal.** Emissão com congelamento de câmbio + snapshot, token público, portal do estudante, PDF, eventos.
**Definição de pronto:** migração versionada, testes verdes, autorização verificada, textos em `pt-BR`, sem `any`, sem `service_role` em código de requisição de usuário além do padrão já adotado nas rotas do portal.

---
## 13. Previsto na arquitetura, fora desta implementação
Portal de autogestão do fornecedor; aplicações/matrículas; venda e contas a receber; gateways de pagamento; CRM com pipelines/tarefas/leads; WhatsApp na linha do tempo; relatórios. **Decisões futuras:** catálogo compartilhado entre tenants; versionamento de conteúdo de produto com aprovação.

---
## 14. Decisões que dependem de você (registrar em `docs/decisions.md` quando fechadas)
1. Média por unidade antes ou depois do desconto (T7 assume **antes**).
2. Teto de desconto manual por papel.
3. Fonte/frequência da taxa de câmbio e spread padrão da Forio.
4. Política de validade padrão da cotação (7/15/30 dias).
5. Base da comissão (tuition / tuition+fees / total) e se por fornecedor ou global.

---
*Especificação derivada da engenharia reversa da plataforma Edvisor (21/08/2026) + modelagem de domínio. Adaptada às convenções do portal EXP Tour conforme `docs/decisions.md` (ADR-001).*
