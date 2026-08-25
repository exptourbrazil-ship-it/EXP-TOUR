-- EXP Tour / Forio - Schema inicial da Area do Cliente
-- Titulares: responsavel financeiro / login por CPF
create table if not exists titulares (
  id uuid primary key default gen_random_uuid(),
  nome_completo text not null,
  cpf text not null unique,
  telefone text,
  created_at timestamptz not null default now()
  );

-- Contratos: uma viagem/grupo contratado por um titular
create table if not exists contratos (
  id uuid primary key default gen_random_uuid(),
  titular_id uuid not null references titulares(id) on delete cascade,
  nome text not null,
  valor_total numeric(12,2) not null,
  moeda text not null default 'CAD',
  estudante_nome text,               -- nome do estudante (aparece na aba Inicio/Retorno)
  estudante_sexo text check (estudante_sexo in ('F','M')), -- artigo da msg de indicacao
  pais_destino text,                 -- slug do destino (ex.: 'canada','eua','nova_zelandia')
  -- Cancelamento (soft). Sem isto a regua de cobranca continuava enviando
  -- e-mail para quem ja tinha desistido: nao havia nada no modelo que
  -- representasse um contrato cancelado. Apagar o contrato apagaria as
  -- parcelas em cascata e destruiria o historico.
  cancelado_em timestamptz,          -- data EFETIVA (pode ser retroativa)
  cancelado_tipo text check (cancelado_tipo is null or cancelado_tipo in
    ('arrependimento','desistencia','erro_cadastro','outro')),
  cancelado_motivo text,
  cancelado_por text,                -- usuario admin que registrou
  created_at timestamptz not null default now()
  );
create index if not exists idx_contratos_cancelado_em on contratos(cancelado_em);

-- Colunas aplicadas depois via SQL Editor em bancos ja existentes (o create
-- acima so vale para bancos novos). Ver CLAUDE.md sobre reconciliacao de DDL.
alter table if exists contratos add column if not exists estudante_nome text;
alter table if exists contratos add column if not exists estudante_sexo text
  check (estudante_sexo in ('F','M'));
alter table if exists contratos add column if not exists pais_destino text;
-- Resultado do visto do estudante (por contrato). A transicao para 'negado'
-- dispara o processo de excecao E1 (doc 01 §4) — ver src/lib/visto-service.ts.
alter table if exists contratos add column if not exists visto_status text
  check (visto_status is null or visto_status in ('em_analise','aprovado','negado'));
-- id do Contato no Zoho CRM: chave estavel de dedupe do webhook (independe de
-- qual CPF vira titular). Ver src/app/api/integrations/zoho/webhook/route.ts.
alter table if exists contratos add column if not exists zoho_contact_id text;
create index if not exists idx_contratos_zoho_contact on contratos(zoho_contact_id);

-- Parcelas: cronograma de pagamento de cada contrato
create table if not exists parcelas (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references contratos(id) on delete cascade,
  numero int not null,
  descricao text not null,
  valor_original numeric(12,2) not null,
  valor_atual numeric(12,2) not null, -- valor efetivo na MOEDA DO PROGRAMA (com ajustes do cliente)
  cotacao_aplicada numeric(12,6), -- VET aplicada na geracao do Pix (aplicado direto no SQL Editor)
  valor_cobrado_brl numeric(12,2), -- BRL cobrado na geracao do Pix (migration parcelas_valor_cobrado_brl); limpo ao cancelar
  vencimento date not null,
  is_entrada boolean not null default false,
  status text not null default 'pendente' check (status in ('pendente','pago','atrasado')),
  payment_link text,
  qr_code_url text,
  external_payment_id text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  unique (contrato_id, numero)
  );

create index if not exists idx_parcelas_contrato on parcelas(contrato_id);
create index if not exists idx_contratos_titular on contratos(titular_id);

-- Disputa de pagamento (processo E9, doc 01 §4). Sinaliza que uma parcela paga
-- teve o pagamento CONTESTADO no Mercado Pago (MED Pix / chargeback). O status
-- 'pago' e preservado (o ledger de pagamentos e imutavel); a flag congela o
-- "efeito" e alimenta o processo E9 (aberto pelo webhook). Ver disputa-service.ts.
alter table if exists parcelas add column if not exists em_disputa boolean not null default false;
alter table if exists parcelas add column if not exists disputa_status text; -- status do MP: in_mediation | charged_back

-- Ledger de pagamentos: um lancamento imutavel por parcela paga, com o cambio
-- aplicado e o montante em BRL efetivamente pago (do transaction_amount do
-- Mercado Pago), alem do montante na moeda do programa. A divida vive sempre
-- na moeda do programa; este ledger registra a "fotografia" do cambio no
-- momento de cada pagamento, para conciliacao contabil. Escrito na confirmacao
-- do pagamento (ver src/lib/mp-processar-pagamento.ts). A chave unica
-- (parcela_id, external_payment_id) garante idempotencia no reprocessamento.
create table if not exists pagamentos (
  id uuid primary key default gen_random_uuid(),
  parcela_id uuid not null references parcelas(id) on delete cascade,
  contrato_id uuid not null references contratos(id) on delete cascade,
  external_payment_id text not null,       -- id do pagamento no Mercado Pago
  moeda text not null,                     -- moeda do programa (ex: CAD, USD)
  valor_programa numeric(12,2) not null,   -- montante na moeda do programa
  cotacao_aplicada numeric(12,6),          -- BRL por 1 unidade da moeda (VET)
  valor_brl numeric(12,2) not null,        -- BRL efetivamente pago
  pago_em timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (parcela_id, external_payment_id)
  );

create index if not exists idx_pagamentos_contrato on pagamentos(contrato_id);
create index if not exists idx_pagamentos_parcela on pagamentos(parcela_id);

-- Events: barramento/ledger de eventos externos (webhooks). Fonte de
-- idempotencia e auditoria. Cada notificacao externa vira uma linha; o efeito
-- (ex: marcar parcela como paga) e aplicado no maximo uma vez por
-- idempotency_key. Permite log de tentativas e reprocessamento manual.
create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  source text not null,                 -- ex: 'mercadopago'
  event_type text not null,             -- ex: 'payment'
  idempotency_key text not null unique, -- ex: 'mercadopago:payment:<paymentId>'
  external_id text,                     -- id do recurso na origem (ex: paymentId)
  payload jsonb,                        -- corpo bruto recebido, para auditoria/replay
  status text not null default 'pendente'
    check (status in ('pendente','processado','ignorado','erro')),
  tentativas int not null default 0,
  erro text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
  );

create index if not exists idx_events_status on events(status);
create index if not exists idx_events_source on events(source);
create index if not exists idx_events_external on events(source, external_id);

-- Lembretes de cobranca (regua): registra cada lembrete ja enviado por
-- (parcela, janela), garantindo idempotencia do cron da regua de cobranca
-- (ver src/app/api/cron/regua-cobranca). A constraint unique impede reenvio
-- do mesmo lembrete. Escrita/leitura apenas via service role (cron).
create table if not exists lembretes_cobranca (
  id uuid primary key default gen_random_uuid(),
  parcela_id uuid not null references parcelas(id) on delete cascade,
  janela text not null,               -- 'D-3' | 'D0' | 'D+1' | 'D+5'
  enviado_at timestamptz not null default now(),
  unique (parcela_id, janela)
  );

create index if not exists idx_lembretes_parcela on lembretes_cobranca(parcela_id);

-- Regua de QUITACAO (Clausula 7.12): lembretes D-30/D-15/D-5 antes da
-- data-limite de quitacao, por contrato (distinta da regua por parcela acima).
-- Ja aplicado no banco (migracao lembretes_quitacao).
create table if not exists lembretes_quitacao (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references contratos(id) on delete cascade,
  janela text not null,               -- 'D-30' | 'D-15' | 'D-5'
  enviado_at timestamptz not null default now(),
  unique (contrato_id, janela)
  );

create index if not exists idx_lembretes_quitacao_contrato on lembretes_quitacao(contrato_id);
alter table if exists lembretes_quitacao enable row level security;

-- Anexo III (Politica de Pagamento dos Fornecedores, Clausula 7.5.2): itens por
-- contrato, exibidos ao cliente. Ja aplicado no banco (migracao
-- anexo_iii_fornecedores). Requisitos migratorios (III.3) entram como itens com
-- fornecedor = "Requisito migratorio (...)".
create table if not exists anexo_iii_itens (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references contratos(id) on delete cascade,
  fornecedor text not null,
  natureza text,
  valor numeric(12,2),
  moeda text,
  prazo text,
  evento text,
  documento_viabiliza text,
  consequencia_atraso text,
  politica_cancelamento text,
  fonte text,
  ordem int not null default 0,
  created_at timestamptz not null default now()
  );

create index if not exists idx_anexo_iii_contrato on anexo_iii_itens(contrato_id);
alter table if exists anexo_iii_itens enable row level security;

-- Antecipacoes por exigencia de visto/fornecedor (Clausula 7.5): registradas
-- pela equipe com lastro documental e exibidas ao cliente. Ja aplicado no banco
-- (migracao antecipacoes_exigencia).
create table if not exists antecipacoes (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references contratos(id) on delete cascade,
  documento text not null,              -- documento que o pagamento viabiliza
  justificativa text,                   -- composicao/motivo da exigencia
  valor numeric(12,2) not null,         -- valor a antecipar, na moeda do programa
  moeda text not null,
  data_limite date not null,            -- data-limite fixada pelo terceiro
  comprovante_url text,                 -- lastro documental (link), quando houver
  status text not null default 'pendente'
    check (status in ('pendente','atendida','cancelada')),
  criado_por text,
  created_at timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
  );

create index if not exists idx_antecipacoes_contrato on antecipacoes(contrato_id);
create index if not exists idx_antecipacoes_status on antecipacoes(status);
alter table if exists antecipacoes enable row level security;

-- Rate limiting: cada "hit" e uma tentativa (ex.: pedido de codigo de acesso),
-- identificada por uma chave (ex.: "req-code:ip:1.2.3.4"). O limite e checado
-- contando os hits de uma chave dentro de uma janela de tempo. Escrita/leitura
-- apenas via service role (rotas de API). Ver src/lib/rate-limit.ts.
create table if not exists rate_limit_hits (
  id uuid primary key default gen_random_uuid(),
  chave text not null,
  criado_em timestamptz not null default now()
  );

create index if not exists idx_rate_limit_chave_tempo on rate_limit_hits(chave, criado_em);

-- Trilha de auditoria de acoes administrativas sensiveis: quem (usuario) fez
-- qual acao, sobre qual alvo, com que detalhe, de qual IP e quando. Escrita
-- apenas via service role nas rotas admin. Ver src/lib/admin-audit.ts.
create table if not exists admin_audit (
  id uuid primary key default gen_random_uuid(),
  usuario text not null,
  acao text not null,
  alvo text,
  detalhe jsonb,
  ip text,
  criado_em timestamptz not null default now()
  );

create index if not exists idx_admin_audit_criado on admin_audit(criado_em desc);
create index if not exists idx_admin_audit_acao on admin_audit(acao);

-- Contas administrativas individuais com papel (RBAC). Evolui o login por codigo
-- de e-mail: em vez de um destinatario fixo (ADMIN_EMAIL), o login passa a
-- aceitar qualquer e-mail ativo aqui, e o papel entra na sessao admin.
-- Ver docs/07-arquitetura-area-administrativa.md (Secao 2) e src/lib/admin-roles.ts.
-- RLS habilitado sem policies: autorizacao e feita em codigo (service role).
create table if not exists admin_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  nome text,
  papel text not null default 'operacao'
    check (papel in ('gestor','operacao','financeiro','consultor')),
  ativo boolean not null default true,
  criado_por text,
  created_at timestamptz not null default now()
  );

-- Fila do Dia: tarefas operacionais do admin (doc 07, Secoes 3.1 e 5). Fontes
-- automaticas (documento enviado, parcela em D+10, SLA estourado) e manuais.
-- A v1 da tela tambem compoe a fila por consulta ao vivo; esta tabela guarda
-- tarefas materializadas/manuais e o estado. Ver src/lib/fila-do-dia.ts.
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  categoria text not null
    check (categoria in ('documento','parcela','proposta','fornecedor','excecao','sistema','outro')),
  titulo text not null,
  contexto text,
  alvo_tipo text,
  alvo_id uuid,
  href text,
  dono text,
  papel text,
  estado text not null default 'aberto'
    check (estado in ('aberto','em_andamento','concluido')),
  prazo timestamptz,
  origem text not null default 'manual',
  chave_dedupe text unique,
  criado_por text,
  criado_em timestamptz not null default now(),
  concluido_em timestamptz
  );

create index if not exists idx_tasks_estado on tasks(estado, criado_em desc);
create index if not exists idx_tasks_dono on tasks(dono) where estado <> 'concluido';

-- Processos de EXCECAO (doc 01, Secao 4; doc 07, Secao 3.2). Uma excecao NAO e
-- um estado da linha principal: e um processo paralelo, com maquina propria,
-- que ao abrir SUSPENDE partes do motor (cobranca/lembretes/avanco) e ao fechar
-- retoma/redireciona/encerra a jornada. Ancorada no CONTRATO (visto negado,
-- deferral etc. sao por estudante/contrato); titular_id denormalizado para o
-- Caso 360 agregar. O "processo ativo" de um contrato e a excecao nao-terminal.
-- Vocabulario e maquina de estados vivem em src/lib/excecao.ts (puro, testado).
-- RLS habilitado sem policies: autorizacao e feita em codigo (service role).
create table if not exists case_exceptions (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references contratos(id) on delete cascade,
  titular_id uuid not null references titulares(id) on delete cascade,
  tipo text not null,                       -- slug E1..E11 (ver src/lib/excecao.ts)
  status text not null default 'aberta'
    check (status in ('aberta','em_andamento','resolvida','cancelada')),
  suspende jsonb not null default '[]'::jsonb, -- dominios suspensos: cobranca/lembretes/avanco
  etapa text,                               -- ponto de decisao atual dentro do processo
  motivo text,                              -- por que foi aberta
  desfecho text                             -- ao resolver: retomada/redirecionamento/encerramento
    check (desfecho is null or desfecho in ('retomada','redirecionamento','encerramento')),
  resolucao text,                           -- nota de resolucao
  aberta_por text,                          -- admin_users.email (ou 'sistema' quando automatica)
  resolvida_por text,
  aberta_em timestamptz not null default now(),
  resolvida_em timestamptz,
  atualizada_em timestamptz not null default now()
  );

create index if not exists idx_case_exceptions_contrato on case_exceptions(contrato_id);
create index if not exists idx_case_exceptions_titular on case_exceptions(titular_id);
-- Fila "excecoes abertas por idade" (doc 07, Secao 1) e "processo ativo" do caso.
create index if not exists idx_case_exceptions_ativas on case_exceptions(status, aberta_em desc)
  where status in ('aberta','em_andamento');
-- No maximo UMA excecao ativa do mesmo tipo por contrato: o pre-check em codigo
-- (abrirExcecao) e read-then-insert e nao segura duas aberturas concorrentes;
-- este indice unico parcial e a garantia real no banco.
create unique index if not exists uidx_case_exceptions_ativa
  on case_exceptions(contrato_id, tipo) where status in ('aberta','em_andamento');
alter table if exists case_exceptions enable row level security;

-- Acertos de cancelamento/alteracao (motor de acerto — doc 01 §4 E4/E5/E6/E7;
-- doc 07 §3.5). NESTE passo guarda o RASCUNHO calculado (retencao/multa, saldo a
-- devolver, memoria de calculo) para o Financeiro revisar. NAO propoe ao cliente,
-- NAO coleta aceite, NAO executa refund (marcos proprios; dinheiro so muda por
-- webhook confirmado). `provisorio` = regras de retencao ainda placeholder
-- (pendentes de validacao juridica). Vocabulario/calculo em src/lib/acerto.ts.
-- RLS habilitado sem policies: autorizacao e feita em codigo (service role).
create table if not exists acertos (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references contratos(id) on delete cascade,
  titular_id uuid not null references titulares(id) on delete cascade,
  excecao_id uuid references case_exceptions(id),
  tipo_cancelamento text,                 -- slug da excecao de origem (E4/E5/E6/E7)
  status text not null default 'rascunho'
    check (status in ('rascunho','proposto','aceito','executado','cancelado')),
  moeda text,
  valor_total numeric(12,2),
  total_pago numeric(12,2),
  retencao_percentual numeric(6,4),
  retencao_valor numeric(12,2),
  refund_escola_esperado numeric(12,2),
  saldo_devolver_cliente numeric(12,2),
  memoria jsonb,                          -- linhas da memoria de calculo
  provisorio boolean not null default true,
  criado_por text,
  criado_em timestamptz not null default now(),
  atualizada_em timestamptz not null default now()
  );

create index if not exists idx_acertos_contrato on acertos(contrato_id);
create index if not exists idx_acertos_titular on acertos(titular_id);
-- Execucao do acerto (Fatia B): proposta ao cliente + aceite eletronico.
alter table if exists acertos add column if not exists proposto_em timestamptz;
alter table if exists acertos add column if not exists aceito_em timestamptz;
-- termo_id sem FK: `termos` e definido mais abaixo no arquivo (integridade
-- garantida em codigo, no padrao RLS-sem-policy do portal).
alter table if exists acertos add column if not exists termo_id uuid;
-- Execucao do acerto (Fatia C/D): meio do refund e quando foi executado.
alter table if exists acertos add column if not exists refund_meio text;
alter table if exists acertos add column if not exists executado_em timestamptz;

-- No maximo UM rascunho por (contrato, EXCECAO de origem): recalcular atualiza o
-- rascunho daquela excecao (o read-then-write em codigo nao segura duas
-- requisicoes concorrentes). Por excecao — e nao so por contrato — para um
-- cancelamento (E4-E7) e um credito de escopo (E3) coexistirem sem se
-- sobrescrever quando ambas as excecoes estao ativas no mesmo contrato.
drop index if exists uidx_acertos_rascunho;
create unique index if not exists uidx_acertos_rascunho
  on acertos(contrato_id, excecao_id) where status = 'rascunho';
alter table if exists acertos enable row level security;

-- Config de RETENCAO por instancia (motor de acerto, Fatia A). Tira as faixas do
-- hardcode: o motor le daqui. Enquanto `validado_juridicamente=false`, a memoria
-- do acerto marca `provisorio=true` (aviso na tela). Uma unica linha vigente
-- (portal single-tenant). Gerida por config.gerir (so Gestor). RLS sem policy.
create table if not exists config_retencao (
  id uuid primary key default gen_random_uuid(),
  faixas jsonb not null,                     -- [{minDiasAteInicio, percentual}]
  tipos_sem_retencao jsonb not null default '[]'::jsonb, -- ex.: ["cancelamento_escola"]
  validado_juridicamente boolean not null default false,
  vigente boolean not null default true,
  observacao text,
  atualizado_por text,
  criado_em timestamptz not null default now(),
  atualizada_em timestamptz not null default now()
  );
-- No maximo UMA config vigente.
create unique index if not exists uidx_config_retencao_vigente
  on config_retencao(vigente) where vigente = true;
alter table if exists config_retencao enable row level security;

-- Seed: replica o PLACEHOLDER atual como config NAO validada (mantem o
-- comportamento provisorio=true ate a validacao juridica). So insere se vazia.
insert into config_retencao (faixas, tipos_sem_retencao, validado_juridicamente, observacao)
select
  '[{"minDiasAteInicio":60,"percentual":0.10},{"minDiasAteInicio":30,"percentual":0.25},{"minDiasAteInicio":0,"percentual":0.50}]'::jsonb,
  '["cancelamento_escola"]'::jsonb,
  false,
  'Seed placeholder (a validar juridicamente).'
where not exists (select 1 from config_retencao where vigente = true);

-- Ledger de ESTORNOS (motor de acerto, Fatia C/D): um lancamento por refund
-- (estorno via MP) ou devolucao manual. Espelha o padrao imutavel de
-- `pagamentos`. A execucao (Fatia D) grava aqui e so marca o acerto `executado`
-- quando o webhook de estorno confirma. RLS habilitado sem policy.
create table if not exists estornos (
  id uuid primary key default gen_random_uuid(),
  acerto_id uuid not null references acertos(id) on delete cascade,
  pagamento_id uuid references pagamentos(id),
  external_refund_id text,                 -- id do refund no Mercado Pago
  valor_brl numeric(12,2),
  meio text not null default 'mp' check (meio in ('mp','manual')),
  status text not null default 'pendente'
    check (status in ('pendente','confirmado','erro','manual')),
  erro text,
  comprovante_url text,                     -- devolucao manual
  criado_por text,
  criado_em timestamptz not null default now(),
  atualizada_em timestamptz not null default now()
  );
create index if not exists idx_estornos_acerto on estornos(acerto_id);
-- Idempotencia: um estorno por (acerto, pagamento) e um por refund id do MP.
create unique index if not exists uidx_estornos_acerto_pagamento
  on estornos(acerto_id, pagamento_id) where pagamento_id is not null;
create unique index if not exists uidx_estornos_refund
  on estornos(external_refund_id) where external_refund_id is not null;
-- Idempotencia da devolucao MANUAL (pagamento_id NULL, fora dos indices acima):
-- no maximo UMA por acerto, para nao pagar a mao duas vezes.
create unique index if not exists uidx_estornos_manual
  on estornos(acerto_id) where meio = 'manual';
alter table if exists estornos enable row level security;

-- Alteracoes de plano (motor de alteracao — E2 adiamento; doc 01 §4). NESTE
-- passo guarda a PREVIA do plano recalculado (nova data-limite de quitacao +
-- reagendamento do saldo em aberto) como RASCUNHO para o Financeiro/Operacao
-- revisar. NAO reescreve parcelas nem gera aditivo (aplicacao = marco proprio).
-- Calculo em src/lib/parcelas.ts (calcularPlanoDeferral). RLS sem policy.
create table if not exists alteracoes (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references contratos(id) on delete cascade,
  titular_id uuid not null references titulares(id) on delete cascade,
  excecao_id uuid references case_exceptions(id),
  -- Discrimina o motor de alteracao: 'deferral' (E2, so move datas) ou
  -- 'escopo' (E3, muda o valor do programa -> delta financeiro).
  tipo text not null default 'deferral'
    check (tipo in ('deferral','escopo')),
  status text not null default 'rascunho'
    check (status in ('rascunho','aplicado','cancelado')),
  data_inicio_atual date,
  nova_data_inicio date,
  nova_data_quitacao date,
  saldo_devedor numeric(12,2),
  moeda text,
  num_parcelas int,
  plano_proposto jsonb,                   -- [{numero, vencimento, valor}]
  -- Campos do E3 (alteracao de escopo); nulos para 'deferral'.
  valor_programa_atual numeric(12,2),
  valor_programa_novo numeric(12,2),
  delta numeric(12,2),                     -- novo - atual (na moeda)
  ja_pago numeric(12,2),
  credito_cliente numeric(12,2),           -- refund a apurar (motor de acerto)
  sentido text check (sentido in ('aditivo','credito','neutro')),
  provisorio boolean not null default true,
  criado_por text,
  criado_em timestamptz not null default now(),
  atualizada_em timestamptz not null default now()
  );

-- Colunas adicionadas apos a criacao inicial da tabela (bancos ja migrados).
alter table if exists alteracoes add column if not exists tipo text not null default 'deferral';
alter table if exists alteracoes add column if not exists valor_programa_atual numeric(12,2);
alter table if exists alteracoes add column if not exists valor_programa_novo numeric(12,2);
alter table if exists alteracoes add column if not exists delta numeric(12,2);
alter table if exists alteracoes add column if not exists ja_pago numeric(12,2);
alter table if exists alteracoes add column if not exists credito_cliente numeric(12,2);
alter table if exists alteracoes add column if not exists sentido text;
-- CHECKs para bancos ja migrados (o create table acima so vale em banco novo).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'alteracoes_tipo_check') then
    alter table alteracoes add constraint alteracoes_tipo_check check (tipo in ('deferral','escopo'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'alteracoes_sentido_check') then
    alter table alteracoes add constraint alteracoes_sentido_check check (sentido in ('aditivo','credito','neutro'));
  end if;
end $$;

-- Execucao em cascata: quando/quem aplicou o rascunho.
alter table if exists alteracoes add column if not exists aplicada_em timestamptz;
alter table if exists alteracoes add column if not exists aplicada_por text;
-- Aditivo de compra (E3 delta>0, Fatia E): consentimento eletronico do cliente.
-- termo_id sem FK (termos vem depois no arquivo; integridade em codigo).
alter table if exists alteracoes add column if not exists aditivo_termo_id uuid;
alter table if exists alteracoes add column if not exists aditivo_proposto_em timestamptz;
alter table if exists alteracoes add column if not exists aditivo_aceito_em timestamptz;

create index if not exists idx_alteracoes_contrato on alteracoes(contrato_id);
create index if not exists idx_alteracoes_titular on alteracoes(titular_id);
-- Um rascunho por (contrato, tipo): E2 e E3 podem coexistir sem colidir.
drop index if exists uidx_alteracoes_rascunho;
create unique index if not exists uidx_alteracoes_rascunho
  on alteracoes(contrato_id, tipo) where status = 'rascunho';
alter table if exists alteracoes enable row level security;

-- ---------------------------------------------------------------------------
-- Execucao em cascata do motor de alteracao (E2/E3): aplica o RASCUNHO revisado
-- reescrevendo as parcelas EM ABERTO, atualizando o contrato e marcando a
-- alteracao como aplicada — tudo em UMA transacao (a funcao roda atomica).
-- Invariantes preservadas: parcelas pagas nunca sao tocadas; recusa se houver
-- Pix em aberto ou parcela em disputa; a soma das parcelas continua igual ao
-- valor do contrato (na moeda); dinheiro nao muda de estado (so cria cobrancas
-- a vencer, pagas via webhook). A validacao de negocio (posse, excecao ativa,
-- credito -> acerto, plano nao-vencido) fica no servico; a funcao re-checa os
-- invariantes de dinheiro dentro da transacao para fechar corridas.
-- ---------------------------------------------------------------------------
create or replace function aplicar_alteracao(
  p_alteracao_id uuid,
  p_tipo text,
  p_expected_saldo numeric,
  p_expected_valor_atual numeric, -- E3: valor do programa que o rascunho assumiu (revalida sob lock)
  p_new_total numeric,            -- E3: novo valor do programa; E2: ignorado
  p_new_data_inicio date,
  p_parcelas jsonb,
  p_autor text,
  p_ip text
) returns jsonb
language plpgsql
as $$
declare
  v_alt alteracoes%rowtype;
  v_contrato_id uuid;
  v_valor_total numeric;
  v_data_inicio date;
  v_cancelado_em timestamptz;
  v_new_total numeric;
  v_sum_paid numeric;
  v_sum_proposto numeric;
  v_max_numero int;
  v_count_bloqueio int;
  v_item jsonb;
  v_before jsonb;
  v_after jsonb;
begin
  -- Trava o rascunho e valida o estado.
  select * into v_alt from alteracoes where id = p_alteracao_id for update;
  if not found then raise exception 'alteracao_nao_encontrada'; end if;
  if v_alt.status <> 'rascunho' then raise exception 'nao_rascunho'; end if;

  -- Trava o contrato.
  select id, valor_total, data_inicio, cancelado_em
    into v_contrato_id, v_valor_total, v_data_inicio, v_cancelado_em
    from contratos where id = v_alt.contrato_id for update;
  if not found then raise exception 'contrato_nao_encontrado'; end if;
  -- Guarda: contrato cancelado nao pode ter cronograma reescrito.
  if v_cancelado_em is not null then raise exception 'contrato_cancelado'; end if;

  -- Trava as parcelas EM ABERTO: serializa contra a geracao de Pix concorrente
  -- (que atua na parcela), fechando a janela de pagamento orfao.
  perform 1 from parcelas
    where contrato_id = v_contrato_id and status <> 'pago' for update;

  -- Guarda: nenhuma parcela nao-paga com cobranca em aberto (Pix gerado OU
  -- external_payment_id remanescente) — evita ordem/QR apontando p/ parcela deletada.
  select count(*) into v_count_bloqueio from parcelas
    where contrato_id = v_contrato_id and status <> 'pago'
      and (qr_code_url is not null or external_payment_id is not null);
  if v_count_bloqueio > 0 then raise exception 'pix_em_aberto'; end if;

  -- Guarda: nenhuma parcela em disputa (E9) — dinheiro contestado.
  select count(*) into v_count_bloqueio from parcelas
    where contrato_id = v_contrato_id and em_disputa = true;
  if v_count_bloqueio > 0 then raise exception 'em_disputa'; end if;

  -- Novo total do contrato, decidido SOB LOCK (nao confia cegamente no chamador):
  --  - E3 (escopo): revalida que o valor atual continua o que o rascunho assumiu
  --    (senao um upgrade/alteracao concorrente seria sobrescrito) e usa o novo valor;
  --  - E2 (deferral): o total NAO muda — mantem o valor travado.
  if p_tipo = 'escopo' then
    if round(v_valor_total, 2) <> round(p_expected_valor_atual, 2) then
      raise exception 'desatualizado';
    end if;
    v_new_total := p_new_total;
  else
    v_new_total := v_valor_total;
  end if;

  -- Invariante de soma: novo saldo aplicavel = novo total - pago (parcelas).
  select coalesce(sum(valor_atual), 0) into v_sum_paid from parcelas
    where contrato_id = v_contrato_id and status = 'pago';
  if round(v_new_total - v_sum_paid, 2) <> round(p_expected_saldo, 2) then
    raise exception 'desatualizado';
  end if;

  -- A soma do plano proposto tem de bater com o saldo esperado.
  select coalesce(sum((x->>'valor')::numeric), 0) into v_sum_proposto
    from jsonb_array_elements(p_parcelas) as x;
  if round(v_sum_proposto, 2) <> round(p_expected_saldo, 2) then
    raise exception 'plano_invalido';
  end if;

  -- Snapshot antes (auditoria/replay).
  select jsonb_build_object(
    'valor_total', v_valor_total,
    'data_inicio', v_data_inicio,
    'parcelas', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'numero', numero, 'valor', valor_atual, 'vencimento', vencimento, 'status', status
      ) order by numero), '[]'::jsonb)
      from parcelas where contrato_id = v_contrato_id)
  ) into v_before;

  -- Reescreve o saldo em aberto: remove as nao-pagas (nenhuma tem cobranca) e recria.
  delete from parcelas where contrato_id = v_contrato_id and status <> 'pago';
  select coalesce(max(numero), 0) into v_max_numero from parcelas where contrato_id = v_contrato_id;

  for v_item in select * from jsonb_array_elements(p_parcelas)
  loop
    insert into parcelas (contrato_id, numero, descricao, valor_original, valor_atual, vencimento, status, is_entrada)
    values (
      v_contrato_id,
      v_max_numero + (v_item->>'numero')::int,
      coalesce(v_item->>'descricao', 'Parcela'),
      (v_item->>'valor')::numeric,
      (v_item->>'valor')::numeric,
      (v_item->>'vencimento')::date,
      'pendente',
      false
    );
  end loop;

  -- Atualiza o contrato: E3 muda o valor_total (sob lock); E2 regrava o mesmo
  -- valor travado e desloca a data_inicio.
  update contratos
    set valor_total = v_new_total,
        data_inicio = coalesce(p_new_data_inicio, data_inicio)
    where id = v_contrato_id;

  -- Marca o rascunho como aplicado (libera o indice unico de rascunho).
  update alteracoes
    set status = 'aplicado', aplicada_em = now(), aplicada_por = p_autor, atualizada_em = now()
    where id = p_alteracao_id;

  -- Snapshot depois.
  select jsonb_build_object(
    'valor_total', v_new_total,
    'data_inicio', coalesce(p_new_data_inicio, v_data_inicio),
    'parcelas', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'numero', numero, 'valor', valor_atual, 'vencimento', vencimento, 'status', status
      ) order by numero), '[]'::jsonb)
      from parcelas where contrato_id = v_contrato_id)
  ) into v_after;

  -- Evento no ledger (idempotente por idempotency_key) — dentro da transacao.
  insert into events (source, event_type, idempotency_key, external_id, payload, status, processed_at)
  values ('portal', 'alteracao_aplicada', 'alteracao:aplicar:' || p_alteracao_id::text, p_alteracao_id::text,
          jsonb_build_object('tipo', v_alt.tipo, 'antes', v_before, 'depois', v_after, 'autor', p_autor),
          'processado', now())
  on conflict (idempotency_key) do nothing;

  -- Trilha de auditoria — dentro da MESMA transacao (a reescrita nunca fica sem trilha).
  insert into admin_audit (usuario, acao, alvo, detalhe, ip)
  values (p_autor, 'alteracao.aplicar', v_contrato_id::text,
          jsonb_build_object(
            'alteracao_id', p_alteracao_id, 'tipo', v_alt.tipo,
            'novo_total', v_new_total, 'nova_data_inicio', p_new_data_inicio,
            'num_parcelas', jsonb_array_length(p_parcelas)
          ), p_ip);

  return jsonb_build_object('ok', true, 'antes', v_before, 'depois', v_after);
end;
$$;

-- Avaliacoes NPS coletadas na aba Retorno: nota 0-10, classificacao
-- (detrator/neutro/promotor) e comentario opcional. Uma resposta por
-- titular+contrato (o reenvio atualiza a anterior). Escrita/leitura apenas via
-- service role (rota /api/nps e paineis admin). Ver src/lib/nps.ts.
create table if not exists nps_respostas (
  id uuid primary key default gen_random_uuid(),
  titular_id uuid not null references titulares(id) on delete cascade,
  contrato_id uuid references contratos(id) on delete cascade,
  nota int not null check (nota >= 0 and nota <= 10),
  classificacao text check (classificacao in ('detrator','neutro','promotor')),
  comentario text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
  );

create index if not exists idx_nps_titular on nps_respostas(titular_id);
create index if not exists idx_nps_contrato on nps_respostas(contrato_id);

-- Checklist de pre-embarque (aba Embarque): guarda o estado das TAREFAS manuais
-- que o aluno marca (itens de documento marcam sozinhos pelo cofre, nao entram
-- aqui). Uma linha por (titular, contrato, item). Escrita/leitura via service
-- role (rota /api/embarque/checklist). Ver src/lib/embarque.ts.
create table if not exists embarque_checklist (
  id uuid primary key default gen_random_uuid(),
  titular_id uuid not null references titulares(id) on delete cascade,
  contrato_id uuid references contratos(id) on delete cascade,
  item_chave text not null,
  concluido boolean not null default true,
  atualizado_em timestamptz not null default now(),
  unique (titular_id, contrato_id, item_chave)
  );

create index if not exists idx_embarque_titular on embarque_checklist(titular_id);

-- Dados estruturados da aba Viagem (escola, acomodacao e contato local),
-- preenchidos pela equipe. Um registro por contrato. Escrita/leitura via
-- service role. Ver src/app/viagem e src/lib/viagem.ts.
create table if not exists viagem_info (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null unique references contratos(id) on delete cascade,
  escola_nome text,
  escola_endereco text,
  acomodacao_endereco text,
  contato_local_nome text,
  contato_local_telefone text,
  observacoes text,
  atualizado_em timestamptz not null default now()
  );

-- ============================================================================
-- Modelo de seguranca / RLS (revisado)
-- ============================================================================
-- O login e customizado (CPF + codigo por e-mail via Resend, fora do Supabase
-- Auth), entao nao ha auth.uid() para basear policies por linha. Decisao de
-- arquitetura:
--   * TODO acesso ao banco e feito server-side (rotas de API / server
--     components) usando a SERVICE ROLE, que IGNORA o RLS.
--   * A anon key (publica, NEXT_PUBLIC_SUPABASE_ANON_KEY) NAO e usada para ler
--     dados no app. Com RLS habilitado e SEM policies, o acesso anon fica
--     bloqueado por padrao (deny-by-default) -- que e o comportamento desejado.
-- Resultado: RLS habilitado em TODAS as tabelas e ZERO policies publicas.
-- Os buckets de Storage (documentos-admin / documentos-titular) sao privados;
-- os downloads usam URLs assinadas de curta duracao geradas no servidor.
--
-- OBS: varias tabelas abaixo foram criadas direto no SQL Editor (nao ha um
-- "create table" correspondente neste arquivo) -- por isso o "if exists".
-- Reconciliar o DDL completo dessas tabelas aqui e uma divida conhecida
-- (ver CLAUDE.md). Ao criar QUALQUER tabela nova, habilite o RLS dela.

alter table if exists titulares          enable row level security;
alter table if exists contratos          enable row level security;
alter table if exists parcelas           enable row level security;
alter table if exists pagamentos         enable row level security;
alter table if exists documentos         enable row level security;
alter table if exists codigos_acesso     enable row level security;
alter table if exists cotacoes_cambio    enable row level security;
alter table if exists events             enable row level security;
alter table if exists email_logs         enable row level security;
alter table if exists whatsapp_logs      enable row level security;
alter table if exists lembretes_cobranca enable row level security;
alter table if exists rate_limit_hits    enable row level security;
alter table if exists admin_audit        enable row level security;
alter table if exists admin_users        enable row level security;
alter table if exists tasks              enable row level security;
alter table if exists nps_respostas      enable row level security;
alter table if exists embarque_checklist enable row level security;
alter table if exists viagem_info        enable row level security;

-- ============================================================================
-- Zoho Sign — contrato assinado (ver docs/plano-zoho-sign.md)
-- ============================================================================
-- Aplicar tambem no SQL Editor do Supabase de producao (ver CLAUDE.md).

-- Liga o documento (PDF assinado) ao contrato certo (um titular pode ter mais
-- de um contrato). Opcional para os demais documentos.
alter table if exists documentos add column if not exists contrato_id uuid references contratos(id);
create index if not exists idx_documentos_contrato on documentos(contrato_id);

-- Motivo da rejeicao de um documento (Caso 360, analise inline pelo admin).
-- Preenchido quando status='rejeitado'; vai no e-mail de aviso ao titular.
alter table if exists documentos add column if not exists motivo_rejeicao text;
-- Quando o documento foi rejeitado (carimbado na transicao para 'rejeitado';
-- limpo quando sai de rejeitado). Base do E11: documento rejeitado nao reenviado
-- ha >= 30 dias -> cliente incontactavel (ver cron escalar-incontactavel).
alter table if exists documentos add column if not exists rejeitado_em timestamptz;

-- Dados do estudante necessarios ao Zoho Sign: a data de nascimento decide a
-- regra multi-signatario por idade (menor -> so o pagante assina); o e-mail e
-- para o estudante maior assinar. Ambos opcionais (podem ser preenchidos no
-- envio quando faltarem).
alter table if exists contratos add column if not exists estudante_data_nascimento date;
alter table if exists contratos add column if not exists estudante_email text;

-- Inclui 'sistema' no CHECK de documentos.origem (PDF gerado pelo Zoho Sign).
-- Ja aplicado no banco de producao (migracao zoho_sign_fluxo).
alter table if exists documentos drop constraint if exists documentos_origem_check;
alter table if exists documentos add constraint documentos_origem_check
  check (origem in ('zoho','admin','titular','sistema'));

-- Envelope de assinatura: espelho local do estado no Zoho Sign. Uma linha por
-- solicitacao de assinatura de um contrato.
create table if not exists contratos_assinatura (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references contratos(id) on delete cascade,
  envelope_id_zoho text unique,        -- request_id do Zoho Sign
  status text not null default 'rascunho'
    check (status in ('rascunho','enviado','em_andamento','assinado','recusado','expirado')),
  signatarios jsonb,                    -- lista de signatarios (nome/email/papel)
  documento_id uuid references documentos(id), -- PDF final no cofre
  enviado_em timestamptz,
  assinado_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
  );

create index if not exists idx_contratos_assinatura_contrato on contratos_assinatura(contrato_id);
create index if not exists idx_contratos_assinatura_envelope on contratos_assinatura(envelope_id_zoho);

alter table if exists contratos_assinatura enable row level security;

-- Storage: criar o bucket PRIVADO "documentos-contratos" (como os demais); os
-- downloads usam URLs assinadas de curta duracao. Feito no painel do Supabase.

-- ============================================================================
-- Termo de Adesao + aceites (prova de consentimento no checkout / area do cliente)
-- ============================================================================
-- Ja aplicado no banco de producao (migracao aceite_termo_adesao).

-- Versoes do Termo de Adesao. `hash` = SHA-256 do `conteudo` (ver lib/termos.ts).
create table if not exists termos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null default 'adesao',
  versao text not null,
  conteudo text,
  storage_path text,
  hash text not null,
  vigente_desde timestamptz not null default now(),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (tipo, versao)
  );

-- Prova imutavel do aceite: quem, qual versao, qual hash do texto, quando, IP e
-- user-agent. titular_id vira null se o titular for removido (preserva a prova).
create table if not exists aceites (
  id uuid primary key default gen_random_uuid(),
  titular_id uuid references titulares(id) on delete set null,
  proposta_id uuid,
  termo_id uuid not null references termos(id),
  versao text not null,
  hash_conteudo text not null,
  contexto text not null default 'area_cliente' check (contexto in ('checkout','area_cliente')),
  ip text,
  user_agent text,
  data_hora timestamptz not null default now(),
  arrependido_em timestamptz,           -- CDC art. 49: quando o cliente desistiu (7 dias)
  created_at timestamptz not null default now()
  );

create index if not exists idx_aceites_titular on aceites(titular_id);
create index if not exists idx_aceites_termo on aceites(termo_id);
-- Idempotencia atomica da prova: no maximo UM aceite por (titular, termo). Fecha
-- a corrida de duplo-clique/retry do aceite (o read-then-write nao segurava).
create unique index if not exists uidx_aceites_titular_termo on aceites(titular_id, termo_id);

alter table if exists termos  enable row level security;
alter table if exists aceites enable row level security;

-- Propostas (checkout / estados 0-1, Clausula 2.5): criada pela equipe com
-- validade de 10 dias e token para o link publico; ao aceitar (assinatura),
-- provisiona titular + contrato + parcelas. Ja aplicado no banco (migracao
-- propostas_checkout).
create table if not exists propostas (
  id uuid primary key default gen_random_uuid(),
  token text not null unique default gen_random_uuid()::text,
  status text not null default 'rascunho'
    check (status in ('rascunho','enviada','aceita','expirada','cancelada')),
  nome_completo text,
  cpf text,
  email text,
  telefone text,
  programa_nome text,
  estudante_nome text,
  pais_destino text,
  moeda text,
  custo_programa numeric(12,2),          -- saldo devedor inicial, na moeda
  plano jsonb,                           -- plano sugerido de parcelas
  data_inicio date,
  validade date not null default (now() + interval '10 days')::date,
  aceito_em timestamptz,
  contrato_id uuid references contratos(id),
  criado_por text,
  created_at timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
  );

create index if not exists idx_propostas_token on propostas(token);
create index if not exists idx_propostas_status on propostas(status);
alter table if exists propostas enable row level security;

-- codigos_acesso: aplicada direto no Supabase (ver nota no CLAUDE.md sobre
-- tabelas criadas pelo SQL Editor). Registrada aqui para referencia.
--
-- codigo_hash: o codigo de 6 digitos era gravado em TEXTO CLARO e a tabela
-- nunca era expurgada — com o tempo virava um acervo crescente de credenciais
-- de login legiveis. Hoje gravamos apenas HMAC-SHA256 (ver
-- src/lib/codigo-acesso.ts) e o cron limpar-rate-limit apaga o que passa de
-- 24h. A coluna `codigo` segue existindo apenas para nao derrubar quem estiver
-- no meio de um login no momento do deploy; pode ser removida depois.
alter table if exists codigos_acesso add column if not exists codigo_hash text;
-- `codigo` precisa ser opcional: o fluxo novo grava so o hash. Enquanto era
-- NOT NULL, todo insert falhava (incidente de 15/08/2026).
alter table if exists codigos_acesso alter column codigo drop not null;
create index if not exists idx_codigos_acesso_titular_ativo
  on codigos_acesso(titular_id, used_at, created_at desc);

-- ============================================================================
-- Modulo Catalogo/Preco/Cotacao — Marco 1 (spec-catalogo-preco-cotacao.md 3.1-3.3)
-- Adaptado ao ADR-001: identificadores em ingles, tenant_id em toda tabela
-- (single-tenant hoje, multi-tenant preparado), RLS habilitado sem policies
-- (autorizacao em codigo/service role). Enums via text + CHECK.
-- ============================================================================

create table if not exists tenant (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  default_locale text not null default 'pt-BR',
  default_presentment_currency char(3) not null default 'BRL',
  logo_url text, brand_color text,
  contact_email text, contact_phone text, website text, address text,
  created_at timestamptz not null default now(), updated_at timestamptz, archived_at timestamptz
);

create table if not exists tenant_fx_policy (
  tenant_id uuid primary key references tenant(id) on delete cascade,
  markup_percent numeric(6,4) not null default 0,
  rounding_mode text not null default 'none' check (rounding_mode in ('none','up_1','up_10','up_100')),
  rate_source text not null default 'manual',
  max_rate_age_hours int not null default 24,
  disclaimer text not null default '',
  created_at timestamptz not null default now(), updated_at timestamptz
);

create table if not exists supplier (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id),
  display_name text not null, legal_name text, country_code char(2), website text, logo_url text,
  relationship_status text not null default 'prospect'
    check (relationship_status in ('prospect','requested','connected','paused','declined','disconnected')),
  is_preferred boolean not null default false,
  verified_at timestamptz, internal_notes text, owner_user_id uuid,
  created_at timestamptz not null default now(), updated_at timestamptz, archived_at timestamptz
);
create index if not exists idx_supplier_tenant_status on supplier(tenant_id, relationship_status);
-- Id do Vendor no Zoho CRM: chave de idempotencia da sincronizacao Vendors ->
-- supplier. Indice unico simples: o Postgres permite varios NULLs, entao os
-- suppliers cadastrados a mao (sem Vendor) convivem, e o upsert por
-- zoho_vendor_id tem um arbitro valido.
alter table supplier add column if not exists zoho_vendor_id text;
create unique index if not exists idx_supplier_zoho_vendor on supplier(zoho_vendor_id);

create table if not exists supplier_group (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id),
  name text not null,
  created_at timestamptz not null default now(), updated_at timestamptz, archived_at timestamptz
);
create table if not exists supplier_group_member (
  supplier_group_id uuid not null references supplier_group(id) on delete cascade,
  supplier_id uuid not null references supplier(id) on delete cascade,
  primary key (supplier_group_id, supplier_id)
);

create table if not exists supplier_agreement (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id),
  supplier_id uuid not null references supplier(id) on delete cascade,
  valid_from date not null, valid_until date,
  commission_basis text not null check (commission_basis in ('tuition','tuition_plus_fees','total','none')),
  commission_type text not null check (commission_type in ('percent','fixed_per_sale','fixed_per_week')),
  commission_value numeric(14,4) not null, currency char(3),
  payment_terms text, document_url text, notes text,
  created_at timestamptz not null default now(), updated_at timestamptz, archived_at timestamptz
);
create index if not exists idx_supplier_agreement_supplier on supplier_agreement(supplier_id, valid_from desc);

-- Usuarios do Portal do Fornecedor (login por e-mail + codigo, doc 06 secao 1).
-- Cada usuario pertence a um supplier (a instituicao). O login busca por e-mail;
-- por isso o e-mail e unico globalmente (guardado em minusculas). Papel e flags
-- de alerta controlam telas/notificacoes (matriz da doc 06 secao 2/3.7).
-- Sem RLS por policy: autorizacao feita em codigo, como o resto do projeto.
create table if not exists supplier_user (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id),
  supplier_id uuid not null references supplier(id) on delete cascade,
  email text not null unique,
  name text not null,
  role text not null default 'admissions'
    check (role in ('supplier_admin','admissions','finance','marketing')),
  language char(2) not null default 'en' check (language in ('en','pt')),
  alert_flags jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  archived_at timestamptz
);
create index if not exists idx_supplier_user_supplier on supplier_user(supplier_id);
alter table supplier_user enable row level security;

create table if not exists campus (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id),
  supplier_id uuid not null references supplier(id) on delete cascade,
  name text not null, country_code char(2) not null, region text, city text not null,
  address text, postal_code text, latitude numeric(9,6), longitude numeric(9,6),
  timezone text not null, base_currency char(3) not null,
  phone text, email text, website text, logo_url text, cover_image_url text,
  status text not null default 'draft' check (status in ('draft','active','inactive')),
  created_at timestamptz not null default now(), updated_at timestamptz, archived_at timestamptz
);
create index if not exists idx_campus_tenant_supplier_status on campus(tenant_id, supplier_id, status);

create table if not exists campus_settings (
  campus_id uuid primary key references campus(id) on delete cascade,
  units_enabled text[] not null default '{week}',
  lesson_minutes int, course_min_age int, course_max_age int,
  course_min_duration int, course_max_duration int, course_language_level_required text,
  accommodation_min_age int, accommodation_max_age int,
  accommodation_min_duration int, accommodation_max_duration int, accommodation_checkout_weekday int,
  multi_course_fee_rule text not null default 'charge_highest'
    check (multi_course_fee_rule in ('charge_highest','charge_lowest','charge_all')),
  default_unit text not null default 'week',
  created_at timestamptz not null default now(), updated_at timestamptz
);

create table if not exists campus_content (
  campus_id uuid not null references campus(id) on delete cascade,
  locale text not null,
  highlights jsonb, highlights_footer text, description_html text,
  is_machine_translated boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz,
  primary key (campus_id, locale)
);

create table if not exists campus_media (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id),
  campus_id uuid not null references campus(id) on delete cascade,
  url text not null, kind text check (kind in ('photo','video','brochure')),
  sort int not null default 0, caption text,
  created_at timestamptz not null default now()
);

create table if not exists campus_document (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id),
  campus_id uuid not null references campus(id) on delete cascade,
  locale text not null,
  kind text not null check (kind in ('terms_and_conditions','payment_refund_policy','application_instructions')),
  body_html text not null, version int not null default 1, published_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz,
  unique (campus_id, locale, kind)
);

create table if not exists campus_calendar_entry (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id),
  campus_id uuid not null references campus(id) on delete cascade,
  kind text not null check (kind in ('course_start','accommodation_arrival','holiday','closure')),
  date date not null, label text, applies_to_product_ids uuid[],
  created_at timestamptz not null default now()
);
create index if not exists idx_campus_calendar on campus_calendar_entry(campus_id, kind, date);

create table if not exists market (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id),
  name text not null, country_codes char(2)[] not null, is_default boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz, archived_at timestamptz
);
create index if not exists idx_market_tenant on market(tenant_id);

alter table if exists tenant                 enable row level security;
alter table if exists tenant_fx_policy       enable row level security;
alter table if exists supplier               enable row level security;
alter table if exists supplier_group         enable row level security;
alter table if exists supplier_group_member  enable row level security;
alter table if exists supplier_agreement     enable row level security;
alter table if exists campus                 enable row level security;
alter table if exists campus_settings        enable row level security;
alter table if exists campus_content         enable row level security;
alter table if exists campus_media           enable row level security;
alter table if exists campus_document        enable row level security;
alter table if exists campus_calendar_entry  enable row level security;
alter table if exists market                 enable row level security;

-- ============================================================================
-- Modulo Catalogo/Preco/Cotacao — Marco 3 (spec 3.4-3.6): produtos, elegibilidade,
-- preco, taxas, promocoes. Mesmas convencoes do Marco 1 (ingles, tenant_id, RLS
-- sem policies, enums text+CHECK). Ligavel ao motor de preco (src/lib/pricing.ts)
-- e aos helpers puros (src/lib/catalog.ts: resolveMarket, evaluateEligibility).
-- ============================================================================

create table if not exists product (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id),
  campus_id uuid not null references campus(id) on delete cascade,
  kind text not null check (kind in ('program','accommodation','insurance','other','package')),
  name text not null, internal_code text,
  source text not null default 'internal' check (source in ('internal','supplier')),
  visibility text not null default 'internal' check (visibility in ('hidden','internal','quotable','sellable')),
  status text not null default 'draft' check (status in ('draft','active','inactive')),
  default_unit text not null default 'week', min_duration int, max_duration int,
  available_from date, available_until date,
  attributes jsonb not null default '{}', created_by_user_id uuid,
  created_at timestamptz not null default now(), updated_at timestamptz, archived_at timestamptz
);
create index if not exists idx_product_catalog on product(tenant_id, campus_id, kind, status);
create index if not exists idx_product_attributes on product using gin (attributes);

create table if not exists product_type_schema (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id),
  kind text not null, key text not null, label text not null,
  json_schema jsonb not null, search_facets text[] not null default '{}',
  created_at timestamptz not null default now(), updated_at timestamptz,
  unique (tenant_id, kind, key)
);

create table if not exists program_detail (
  product_id uuid primary key references product(id) on delete cascade,
  education_type text, subject text, language text,
  delivery_method text check (delivery_method in ('in_person','online','hybrid')),
  format text, institution_type text, grades text[],
  lessons_per_week int, hours_per_week numeric(5,2),
  is_pathway boolean, includes_activities boolean, timetable jsonb
);
create table if not exists accommodation_detail (
  product_id uuid primary key references product(id) on delete cascade,
  accommodation_type text check (accommodation_type in ('homestay','residence','shared_apartment','studio','hotel','other')),
  room_type text check (room_type in ('private','shared_2','shared_3plus')),
  bathroom_type text check (bathroom_type in ('private','shared')),
  meal_plan text check (meal_plan in ('none','breakfast','half_board','full_board','self_catering')),
  distance_to_campus_minutes int, check_in_weekday int, check_out_weekday int
);
create table if not exists insurance_detail (
  product_id uuid primary key references product(id) on delete cascade,
  provider_name text, coverage_summary text,
  policy_unit text check (policy_unit in ('day','week','month')), max_duration_days int
);
create table if not exists other_product_detail (
  product_id uuid primary key references product(id) on delete cascade,
  charge_unit text not null check (charge_unit in ('once','day','night','week','person','unit')), category text
);
create table if not exists package (
  product_id uuid primary key references product(id) on delete cascade,
  valid_from date, valid_until date,
  pricing_mode text not null check (pricing_mode in ('sum_of_items','fixed_price'))
);
create table if not exists package_item (
  id uuid primary key default gen_random_uuid(),
  package_product_id uuid not null references product(id) on delete cascade,
  item_product_id uuid not null references product(id) on delete cascade,
  quantity numeric(10,2), unit text, is_optional boolean not null default false, sort int not null default 0
);
create table if not exists product_content (
  product_id uuid not null references product(id) on delete cascade,
  locale text not null,
  description_html text, highlights jsonb, inclusions jsonb, exclusions jsonb,
  is_machine_translated boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz,
  primary key (product_id, locale)
);
create table if not exists product_media (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id),
  product_id uuid not null references product(id) on delete cascade,
  url text not null, kind text, sort int not null default 0, caption text,
  created_at timestamptz not null default now()
);

create table if not exists eligibility_rule (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id),
  product_id uuid not null references product(id) on delete cascade,
  group_index int not null default 0,
  attribute text not null check (attribute in
    ('age_at_start','nationality','residence_country','language_level','education_level','onshore_status','has_visa')),
  operator text not null check (operator in ('between','in','not_in','gte','lte','eq')),
  value jsonb not null, is_blocking boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_eligibility_product on eligibility_rule(product_id, group_index);

create table if not exists price_template (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id),
  campus_id uuid not null references campus(id) on delete cascade,
  name text not null,
  price_basis text not null check (price_basis in ('duration','quantity','fixed','per_person')),
  duration_type text not null default 'flexible' check (duration_type in ('flexible','fixed_sessions')),
  unit text not null, currency char(3) not null,
  min_quantity int, max_quantity int,
  charge_in_tiers boolean not null default false,
  market_id uuid references market(id),
  valid_from date not null, valid_until date,
  status text not null default 'draft' check (status in ('draft','active','expired')),
  created_at timestamptz not null default now(), updated_at timestamptz, archived_at timestamptz
);
create index if not exists idx_price_template_campus on price_template(campus_id, market_id, status);
create table if not exists price_tier (
  id uuid primary key default gen_random_uuid(),
  price_template_id uuid not null references price_template(id) on delete cascade,
  min_quantity int not null, unit_price numeric(14,2) not null, sort int not null default 0,
  unique (price_template_id, min_quantity)
);
create table if not exists price_template_product (
  price_template_id uuid not null references price_template(id) on delete cascade,
  product_id uuid not null references product(id) on delete cascade,
  primary key (price_template_id, product_id)
);
create table if not exists price_transition_rule (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id),
  campus_id uuid references campus(id) on delete cascade,
  strategy text not null check (strategy in ('split_by_period','use_start_date_price','use_booking_date_price')),
  applies_to_kind text, created_at timestamptz not null default now()
);

create table if not exists fee (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id),
  campus_id uuid not null references campus(id) on delete cascade,
  name text not null,
  fee_type text not null check (fee_type in
    ('registration','material','bank','placement','service','courier','courier_of_documents','custom')),
  charge_basis text not null check (charge_basis in ('once_per_quote','once_per_item','per_unit','per_person')),
  amount numeric(14,2), currency char(3), price_template_id uuid references price_template(id),
  is_refundable boolean, is_mandatory boolean not null default true,
  applies_to_kinds text[] not null default '{}', valid_from date, valid_until date,
  created_at timestamptz not null default now(), updated_at timestamptz, archived_at timestamptz,
  constraint fee_amount_xor_template check ((amount is not null) <> (price_template_id is not null))
);
create table if not exists fee_product (
  fee_id uuid not null references fee(id) on delete cascade,
  product_id uuid not null references product(id) on delete cascade,
  primary key (fee_id, product_id)
);

create table if not exists promotion (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id),
  campus_id uuid references campus(id) on delete cascade,
  supplier_id uuid not null references supplier(id) on delete cascade,
  name text not null,
  promo_type text not null check (promo_type in
    ('percent_off','fixed_off','free_units','waive_fee','free_product','override_price')),
  value numeric(14,4),
  free_units_semantics text check (free_units_semantics in ('bonus_on_top','discount_on_booked')),
  applies_to text not null check (applies_to in
    ('tuition','accommodation','insurance','fees','specific_fee','total','specific_product')),
  applies_to_ref_id uuid, min_quantity int, max_discount_amount numeric(14,2),
  is_stackable boolean not null default false, priority int not null default 100,
  booking_from date, booking_until date, travel_from date, travel_until date,
  status text not null default 'draft' check (status in ('draft','active','expired')),
  created_at timestamptz not null default now(), updated_at timestamptz, archived_at timestamptz
);
create index if not exists idx_promotion_supplier on promotion(tenant_id, supplier_id, status);
create table if not exists promotion_target (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references promotion(id) on delete cascade,
  dimension text not null check (dimension in ('market','nationality','campus','partner','product','education_type')),
  value text not null
);
create index if not exists idx_promotion_target on promotion_target(promotion_id, dimension);

alter table if exists product                enable row level security;
alter table if exists product_type_schema    enable row level security;
alter table if exists program_detail         enable row level security;
alter table if exists accommodation_detail   enable row level security;
alter table if exists insurance_detail       enable row level security;
alter table if exists other_product_detail   enable row level security;
alter table if exists package                enable row level security;
alter table if exists package_item           enable row level security;
alter table if exists product_content        enable row level security;
alter table if exists product_media          enable row level security;
alter table if exists eligibility_rule       enable row level security;
alter table if exists price_template         enable row level security;
alter table if exists price_tier             enable row level security;
alter table if exists price_template_product enable row level security;
alter table if exists price_transition_rule  enable row level security;
alter table if exists fee                    enable row level security;
alter table if exists fee_product            enable row level security;
alter table if exists promotion              enable row level security;
alter table if exists promotion_target       enable row level security;

-- ============================================================================
-- Modulo Catalogo/Preco/Cotacao — Marco 4 (spec 3.7 estudante + 3.8 cotacao).
-- Convencoes ADR-001. fx_rate e referencia global (sem tenant_id).
-- ============================================================================

create table if not exists student (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id),
  first_name text not null, last_name text not null, preferred_name text,
  email text, phone text, whatsapp text, birth_date date, gender text,
  nationality_code char(2), residence_country_code char(2), city text,
  language_level text, education_level text,
  passport_number text, visa_country_code char(2), visa_type text, visa_expiry date,
  onshore_status text check (onshore_status in ('onshore','offshore')),
  source text, owner_user_id uuid, consent jsonb,
  status text not null default 'lead' check (status in ('lead','active','archived')),
  created_at timestamptz not null default now(), updated_at timestamptz, archived_at timestamptz
);
create index if not exists idx_student_tenant on student(tenant_id, status);
create table if not exists student_contact (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id),
  student_id uuid not null references student(id) on delete cascade,
  relationship text check (relationship in ('parent','guardian','spouse','other')),
  name text not null, email text, phone text, is_payer boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists custom_field_definition (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id),
  entity text not null check (entity in ('student','quote','supplier')),
  key text not null, label text not null, field_type text not null,
  options jsonb, sort int not null default 0,
  created_at timestamptz not null default now(),
  unique (tenant_id, entity, key)
);
create table if not exists custom_field_value (
  id uuid primary key default gen_random_uuid(),
  definition_id uuid not null references custom_field_definition(id) on delete cascade,
  record_id uuid not null, value jsonb not null,
  unique (definition_id, record_id)
);

create table if not exists quote (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id),
  reference text not null,
  student_id uuid not null references student(id),
  owner_user_id uuid not null,
  locale text not null default 'pt-BR',
  source_currency char(3), presentment_currency char(3) not null default 'BRL',
  fx_rate numeric(18,8), fx_rate_at timestamptz, fx_source text, fx_markup_percent numeric(6,4),
  issue_date date, valid_until date,
  status text not null default 'draft'
    check (status in ('draft','issued','viewed','option_selected','expired','cancelled','converted')),
  public_token text unique, token_revoked_at timestamptz,
  student_context jsonb not null default '{}',
  notes_html text, selected_option_id uuid,
  created_at timestamptz not null default now(), updated_at timestamptz, archived_at timestamptz,
  unique (tenant_id, reference)
);
create index if not exists idx_quote_tenant_status on quote(tenant_id, status);
create index if not exists idx_quote_owner on quote(owner_user_id);
create table if not exists quote_option (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id),
  quote_id uuid not null references quote(id) on delete cascade,
  label text not null, sort int not null default 0,
  deposit_amount numeric(14,2), deposit_currency char(3),
  is_recommended boolean not null default false, selected_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz
);
create index if not exists idx_quote_option_quote on quote_option(quote_id, sort);
create table if not exists quote_item (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id),
  quote_option_id uuid not null references quote_option(id) on delete cascade,
  "group" text not null check ("group" in ('program','accommodation','insurance','other','package')),
  product_id uuid references product(id), campus_id uuid references campus(id),
  product_snapshot jsonb not null default '{}',
  start_date date, end_date date,
  quantity numeric(10,2) not null, delivered_quantity numeric(10,2) not null,
  unit text not null, unit_price numeric(14,2) not null, gross_amount numeric(14,2) not null,
  currency char(3) not null, price_breakdown jsonb not null default '{}', sort int not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz
);
create index if not exists idx_quote_item_option on quote_item(quote_option_id, sort);
create table if not exists quote_item_fee (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id),
  quote_item_id uuid not null references quote_item(id) on delete cascade,
  fee_id uuid references fee(id),
  name text not null, amount numeric(14,2) not null, currency char(3) not null,
  is_refundable boolean, basis text not null
);
create table if not exists quote_discount (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id),
  quote_option_id uuid not null references quote_option(id) on delete cascade,
  quote_item_id uuid references quote_item(id) on delete cascade,
  promotion_id uuid references promotion(id),
  name text not null,
  discount_type text not null check (discount_type in ('percent','fixed','free_units')),
  value numeric(14,4) not null, applies_to text not null,
  amount numeric(14,2) not null, currency char(3) not null, is_manual boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists quote_payment_plan (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id),
  quote_option_id uuid not null unique references quote_option(id) on delete cascade,
  installments_count int not null, first_due_date date,
  method text check (method in ('pix','boleto','card','bank_transfer','mixed')), notes text,
  created_at timestamptz not null default now(), updated_at timestamptz
);
create table if not exists quote_payment_installment (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references quote_payment_plan(id) on delete cascade,
  sequence int not null, due_date date not null,
  amount numeric(14,2) not null, currency char(3) not null, description text,
  unique (plan_id, sequence)
);
create table if not exists quote_event (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id),
  quote_id uuid not null references quote(id) on delete cascade,
  kind text not null check (kind in
    ('created','issued','sent','opened','option_viewed','downloaded','option_selected','expired','reissued')),
  actor_type text check (actor_type in ('user','student','system')),
  actor_user_id uuid, metadata jsonb, occurred_at timestamptz not null default now()
);
create index if not exists idx_quote_event_quote on quote_event(quote_id, occurred_at desc);
create table if not exists saved_note (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id),
  title text not null, body_html text not null, locale text not null default 'pt-BR',
  created_by_user_id uuid, created_at timestamptz not null default now()
);
create table if not exists fx_rate (
  id uuid primary key default gen_random_uuid(),
  base_currency char(3) not null, quote_currency char(3) not null,
  rate numeric(18,8) not null, source text not null, effective_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_fx_rate_lookup on fx_rate(base_currency, quote_currency, effective_at desc);

alter table if exists student                   enable row level security;
alter table if exists student_contact           enable row level security;
alter table if exists custom_field_definition   enable row level security;
alter table if exists custom_field_value        enable row level security;
alter table if exists quote                     enable row level security;
alter table if exists quote_option              enable row level security;
alter table if exists quote_item                enable row level security;
alter table if exists quote_item_fee            enable row level security;
alter table if exists quote_discount            enable row level security;
alter table if exists quote_payment_plan        enable row level security;
alter table if exists quote_payment_installment enable row level security;
alter table if exists quote_event               enable row level security;
alter table if exists saved_note                enable row level security;
alter table if exists fx_rate                   enable row level security;
