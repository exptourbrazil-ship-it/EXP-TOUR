# Plano — Zoho Sign (contrato) e cópia de documentos no CRM

Bloco 3 do [plano-desenvolvimento-v2.md](./plano-desenvolvimento-v2.md) (item 6,
"assinatura eletrônica"). Desenhado para **espelhar o padrão do webhook do
Mercado Pago** (barramento de eventos) e para **não depender das credenciais do
Zoho no caminho crítico** — a maior parte é construída e testada sem OAuth; só o
envio real do envelope espera as credenciais.

## Princípios (herdados da arquitetura)

- **Supabase é a fonte de verdade dos documentos.** O PDF assinado é persistido
  no Storage do Supabase (cópia durável); o Zoho é a ferramenta de assinatura,
  não a verdade.
- **Cópia no CRM:** cada documento é espelhado como **anexo no Contato** do
  titular no Zoho CRM (sincronização unidirecional Supabase → Zoho). O CRM
  guarda uma cópia comercial; nunca vira segunda verdade. Helper único:
  `espelharDocumentoNoContatoZoho` (`src/lib/zoho-documentos.ts`).
- **Barramento de eventos:** o webhook do Sign entra na tabela `events`
  (idempotência/retry/reprocesso), igual ao Mercado Pago.
- **Cofre já pronto:** o contrato assinado vira um `documento` na taxonomia
  existente (`contrato_prestacao_servicos`, `carta_matricula`).

## Distinção importante: dois "contratos"

1. **Registro `contratos`** (tabela) — entidade operacional/financeira (programa,
   valor, moeda, parcelas). Nasce do admin ou do webhook do Zoho **CRM** no deal
   ganho. **Não** é o Sign.
2. **Contrato assinado (PDF)** — "Contrato de Prestação de Serviços" / "Ficha de
   Matrícula" assinados. **Este** é o produto do Zoho **Sign**.

## Modelo de dados (DDL novo)

- `documentos.contrato_id` — FK opcional para `contratos` (um titular pode ter
  mais de um contrato; o PDF precisa apontar para o certo).
- Nova `origem = 'sistema'` + bucket `documentos-contratos` para o PDF gerado
  pela assinatura. (O resolvedor de bucket do download admin já contempla
  `sistema`; ver `BUCKET_POR_ORIGEM`.)
- Tabela `contratos_assinatura` (o "envelope"): `id`, `contrato_id`,
  `envelope_id_zoho`, `status` (`rascunho`/`enviado`/`assinado`/`recusado`/
  `expirado`), `signatarios` (jsonb), `enviado_at`, `assinado_at`,
  `documento_id` (PDF final). Espelho local do estado do Sign.

## Camadas de código (espelhando o Mercado Pago)

| Camada | MP (existe) | Sign (a criar) |
|---|---|---|
| Puro + testado | `mp-events.ts` | `sign-events.ts`: `montarIdempotencyKey('zoho_sign','envelope',id)` (reusa helper), `extrairEventoSign(payload)`, `montarSignatarios(pagante, estudante, ehMenor)` (multi-signatário por idade — puro/testável) |
| Efeito (server) | `mp-processar-pagamento.ts` | `sign-processar.ts`: no evento "assinado", baixa o PDF do Sign → sobe no Storage → insere/atualiza `documentos` (origem `sistema`, `contrato_id`, status `aprovado`) → atualiza `contratos_assinatura` → **espelha no CRM**. Idempotente por `envelope_id`. |
| Webhook | `api/webhooks/mercadopago` | `api/webhooks/zoho-sign`: grava em `events`, dedupe, chama o efeito, registra tentativas. Sem credenciais, grava o evento como `pendente` para reprocessar. |
| Cliente da API externa | `mercadopago.ts` | `zoho-sign.ts`: `criarEnvelope`, `getEnvelope`, `baixarPdfAssinado` (mesmo estilo de `zoho.ts`, reusa `getAccessToken`). |

## Ações do admin (rotas)

- `POST /api/admin/contratos/[id]/enviar-assinatura` — gera o contrato por merge
  (template Zoho Sign + dados do Supabase), cria o envelope, grava
  `contratos_assinatura`. Protegida por sessão. Só envia de verdade com OAuth.
- `GET /api/admin/documentos/[id]/download` — **FEITO** (passo 1). Admin vê
  qualquer documento (Storage ou anexo Zoho). Fecha o gap da Fase 2.
- `GET /api/admin/zoho/status` — **FEITO**. Autoteste: reporta presença das
  envs (sem valores) e testa a renovação do token.

## Onde o contrato aparece

- **Cliente:** automático na aba Documentos (categoria certa); o download
  (`/api/documentos/[id]/download`) já resolve Storage e anexo Zoho.
- **Admin:** botão "Enviar para assinatura" + status na visão do contrato/cliente;
  PDF visível via `/api/admin/documentos/[id]/download` (link "Ver" na busca por
  CPF — feito).

## Ordem de construção

**Sem depender das credenciais:**
1. ✅ Rota admin de download (gap da Fase 2). — FEITO
2. ✅ Helper de cópia no CRM (`espelharDocumentoNoContatoZoho`) aplicado ao
   upload do cliente e do admin. — FEITO
3. ✅ Autoteste de conexão (`/api/admin/zoho/status`). — FEITO
4. Helpers puros + testes (`sign-events.ts`: idempotência, parse, signatários).
5. Consumidor de `events` + `sign-processar.ts` (testável com payload simulado).
6. DDL: `documentos.contrato_id`, `origem 'sistema'` + bucket, `contratos_assinatura`.

**Só quando o OAuth do Zoho chegar:**
7. `zoho-sign.ts` (API real) + rota de envio + botão no admin → fluxo ponta a ponta.

## Configuração da conexão (feita pela equipe, não pelo assistente)

Definir no ambiente (Vercel) — **os segredos nunca passam pelo assistente**:

- `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET` (do app no Zoho API Console).
- `ZOHO_REFRESH_TOKEN` (ou `ZOHO_TOKEN_RESPONSE` com o JSON bruto da troca do
  grant code).
- `ZOHO_API_DOMAIN` (opcional; padrão `https://www.zohoapis.com`; datacenter
  .eu/.in conforme a conta).

Validar em `GET /api/admin/zoho/status` (logado como admin): `conexao.ok: true`
confirma que a renovação do token funcionou.

## Dependências / decisões abertas

- **Data de nascimento do estudante:** a regra multi-signatário por idade precisa
  saber se é menor; hoje há `contratos.estudante_sexo`, mas não a data de
  nascimento — precisaria de coluna (`estudante_data_nascimento`) ou captura no
  envio.
- **Merge do contrato:** v1 recomenda template no Zoho Sign preenchido com dados
  do Supabase (menos código) em vez de gerar o PDF nós mesmos.
- **LGPD:** contrato é dado pessoal → bucket restrito + URL assinada de curta
  duração (já é o padrão).
