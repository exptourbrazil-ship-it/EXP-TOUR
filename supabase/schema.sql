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
  created_at timestamptz not null default now()
  );

-- Colunas aplicadas depois via SQL Editor em bancos ja existentes (o create
-- acima so vale para bancos novos). Ver CLAUDE.md sobre reconciliacao de DDL.
alter table if exists contratos add column if not exists estudante_nome text;
alter table if exists contratos add column if not exists estudante_sexo text
  check (estudante_sexo in ('F','M'));
alter table if exists contratos add column if not exists pais_destino text;
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
  janela text not null,               -- 'D-7' | 'D-2' | 'D+1' | 'D+5'
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

alter table if exists termos  enable row level security;
alter table if exists aceites enable row level security;
