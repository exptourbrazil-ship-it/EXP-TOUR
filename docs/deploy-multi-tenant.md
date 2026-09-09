# Deploy multi-tenant — EXP Tour e Forio (dois deploys, um banco)

Runbook para operar **EXP Tour** e **Forio** como **dois deploys separados** (uma
URL cada) sobre o **mesmo projeto Supabase**. O isolamento de dados é por
`tenant_id`; o tenant de cada deploy vem da env `CATALOGO_TENANT_SLUG`.

> Pré-requisito de código: o login já é escopado por tenant (cliente, fornecedor
> e admin) — ver PR "Multi-tenant: escopar login por tenant". **Não faça o deploy
> do escopo de login numa URL única antes do 2º deploy existir** (ver
> [Ordem segura de rollout](#ordem-segura-de-rollout)).

## Modelo

- **1 repositório → 2 projetos Vercel.** Mesmo código; o que muda é o conjunto de
  variáveis de ambiente de cada projeto.
- **1 banco Supabase** compartilhado. Cada linha tem `tenant_id`; toda consulta
  escopa por `tenantIdAtual()` (que lê `CATALOGO_TENANT_SLUG`).
- **Cookies são por domínio** (URLs diferentes), então sessões não cruzam entre
  os tenants naturalmente.

| Tenant | slug (`CATALOGO_TENANT_SLUG`) | URL(s) |
| --- | --- | --- |
| EXP Tour | `exp-tour` | (URL atual, ex.: `exp-tour.vercel.app` / domínio próprio) |
| Forio | `forio` | `forio.vercel.app` + `forio.com.br` |

## Variáveis de ambiente

> Exemplos prontos por tenant (placeholders): [`.env.exp-tour.example`](../.env.exp-tour.example)
> e [`.env.forio.example`](../.env.forio.example). Cada linha marca `[DIFERE]` /
> `[COMPARTILHADO]` / `[DECISAO]`.

### A) DEVEM diferir entre os dois projetos

Sem estas corretas, o deploy serve o tenant errado ou vaza marca/links de um no
outro.

| Variável | EXP Tour | Forio | Observação |
| --- | --- | --- | --- |
| `CATALOGO_TENANT_SLUG` | `exp-tour` | `forio` | **Chave de tudo.** Define o tenant do deploy. |
| `EMAIL_DEFAULT_TENANT_SLUG` | `exp-tour` | `forio` | Deixe igual ao slug acima (evita e-mail com a marca errada no fallback). |
| `NEXT_PUBLIC_APP_URL` | URL do EXP Tour | `https://forio.com.br` | Base de links absolutos, e-mails e do webhook de pagamento. |
| `RESEND_FROM_EMAIL` | remetente EXP Tour | — | Remetente do EXP Tour (domínio verificado no Resend). |
| `RESEND_FROM_EMAIL_FORIO` | — | remetente Forio | Remetente do Forio (domínio verificado no Resend). Lido via `tenant-brand.ts`. |
| `EMAIL_LOGO_URL` | logo EXP Tour | logo Forio | Opcional; senão usa o asset padrão da marca. |
| `ADMIN_EMAIL` | contato admin EXP Tour | contato admin Forio | Destinatário de alertas internos. |
| `NEXT_PUBLIC_POLITICA_PRIVACIDADE_URL` | link EXP Tour | link Forio | Marca/jurídico. |
| `NEXT_PUBLIC_GOOGLE_REVIEW_URL` | link EXP Tour | link Forio | Marca. |
| `NEXT_PUBLIC_AFILIADO_*_URL` (chip, moeda, passagem, visto) | links EXP Tour | links Forio | Marca/afiliados. |

### B) Provedores externos — decisão de negócio (conta compartilhada vs. própria)

Estes dependem de os tenants **compartilharem** ou **separarem** a conta do
provedor. Se separar, cada projeto usa as credenciais/segredos do seu tenant e o
webhook aponta para a URL daquele tenant.

| Grupo | Variáveis | Se conta separada por tenant |
| --- | --- | --- |
| Pagamento (Mercado Pago) | `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET`, `MP_NOTIFICATION_URL` | Token/segredo próprios; webhook do MP aponta para `…/api/webhooks/mercadopago` da URL do tenant. `MP_NOTIFICATION_URL` deriva de `NEXT_PUBLIC_APP_URL` se não setado. |
| CRM/Sign (Zoho) | `ZOHO_*`, `ZOHO_WEBHOOK_SECRET`, `ZOHO_SIGN_*` | Credenciais/segredos próprios; webhook do Zoho aponta para a URL do tenant. |
| WhatsApp | `WHATSAPP_*` | Número/app próprios por marca. |

> Se **compartilharem** a conta do provedor, mantenha os mesmos valores nos dois
> projetos — mas atenção: um único webhook do provedor só entrega para **uma**
> URL. Reveja isso caso os dois tenants precisem receber o mesmo tipo de evento.

### C) Podem ser iguais nos dois (compartilhados)

- Supabase: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY` (mesmo banco).
- IA: `ANTHROPIC_API_KEY`, `PRICE_EXTRACT_MODEL`.
- Parâmetros de negócio (podem ser por tenant no futuro via `tenant_config`, mas
  hoje vêm de env): `SPREAD_CAMBIO_PERCENTUAL`, `IOF_CAMBIO_PERCENTUAL`,
  `TETO_DESCONTO_MANUAL_PERCENT`, `INADIMPLENCIA_DIAS`, `INCONTACTAVEL_DIAS`,
  `MP_REFUND_JANELA_DIAS`, `RATE_LIMIT_*`, `CRON_CONFERIR_FATURAS_MAX`,
  `RATE_LIMIT_RETENCAO_HORAS`.

### D) Segredos de sessão/cron — recomendado gerar DISTINTOS por projeto

Funciona compartilhado (cookies são por domínio), mas usar segredos distintos é
defesa em profundidade (um cookie só é válido na sua origem):

- `SESSION_SECRET`, `ADMIN_SESSION_SECRET`, `SUPPLIER_SESSION_SECRET`,
  `ADMIN_CAMBIO_SECRET`.
- `CRON_SECRET` — ver a seção de Cron abaixo.
- (Legado) `ADMIN_USER` / `ADMIN_PASSWORD` — só se ainda usados como fallback.

## Cron — atenção (importante)

Os 5+ jobs de `vercel.json` rodam **por deploy**. Hoje a maioria dos crons é
**global** (processa o banco inteiro, sem filtrar tenant); só `regua-cobranca` e
`conferir-faturas` escopam por tenant. Consequências com dois deploys no mesmo
banco:

- **Crons globais** (`atualizar-cambio`, `conciliar-pagamentos`,
  `conciliar-estornos`, `escalar-inadimplencia`, `escalar-incontactavel`,
  `alertar-eventos`, `alertar-fornecedor`, `materiais-vencidos`,
  `materializar-tasks`, `expirar-cotacoes`, `resumo-semanal-fornecedor`,
  `limpar-rate-limit`): se rodarem nos **dois** deploys, processam **em
  duplicidade**. Efeitos de dinheiro passam pelo ledger `events` (idempotentes),
  mas e-mails/alertas podem duplicar.
- **Crons tenant-aware** (`regua-cobranca`, `conferir-faturas`): cada um só
  processa o tenant do **seu** deploy — então precisam rodar em **ambos** para
  cobrir os dois tenants.

**Recomendação até os crons virarem todos tenant-aware** (ver follow-up abaixo):
mantenha o **Vercel Cron ativo em apenas UM projeto** (o EXP Tour, que hoje
concentra os clientes). Como a Forio ainda não tem clientes, `regua-cobranca` e
`conferir-faturas` da Forio ficariam vazios de qualquer forma. Quando a Forio
passar a ter clientes, promova o item de follow-up (tornar todos os crons
escopados por tenant) para poder rodar os crons com segurança nos dois deploys.

> Como desativar o Cron num projeto: não configure os Cron Jobs naquele projeto
> na Vercel (o `vercel.json` agenda por padrão; a Vercel permite gerir os jobs por
> projeto). Confirme no painel de cada projeto quais jobs estão ativos.

## Ordem segura de rollout

O escopo de login por tenant, numa **URL única** que hoje serve os dois grupos,
tranca o grupo do **outro** tenant. Por isso:

1. **Aplicar as migrations no banco** (já feito): `titulares.tenant_id` NOT NULL e
   `admin_users.tenant_id`. São inofensivas sem o código novo.
2. **Criar o projeto Forio na Vercel** a partir do mesmo repo, com as envs da
   seção A (e B/C/D conforme decidido). Apontar `forio.vercel.app` e
   `forio.com.br`.
3. **Confirmar `CATALOGO_TENANT_SLUG`** em cada projeto (`exp-tour` vs `forio`).
4. **Só então fazer o merge/deploy** do PR de escopo de login. Os dois deploys
   ganham o escopo ao mesmo tempo; cada grupo entra pela sua URL.
5. Ajustar o **Cron** conforme a seção acima (ativo em um projeto por ora).

## Verificação pós-deploy (smoke tests)

- **Isolamento de login (o teste que importa):**
  - Na URL do EXP Tour, um **cliente EXP Tour** entra; um **fornecedor Forio**
    NÃO entra (código não chega / "não autorizado").
  - Na URL da Forio, o inverso.
  - Um **admin global** (tenant NULL) entra nas duas; um admin vinculado a um
    tenant só entra na URL dele.
- **Marca correta** em cada URL (logo, cores, fonte) e nos **e-mails** (remetente
  e template por tenant).
- **Pagamento**: um Pix de teste na URL correta gera o QR e o webhook concilia.
- **Sem vazamento**: catálogo/cotações/clientes de cada URL mostram só o do seu
  tenant.

## Rollback

- **Código**: reverter o PR de escopo de login volta o login a não filtrar por
  tenant (todos entram por qualquer URL) — só faça isso se um dos grupos ficar
  trancado por env errada; o certo é corrigir a env.
- **Banco**: as migrations são compatíveis com o código antigo
  (`titulares.tenant_id` já era usado; `admin_users.tenant_id` é aditivo e
  nullable). Não precisam de rollback para reverter só o código.

## Follow-ups (fora deste runbook)

- **Tornar todos os crons tenant-aware** (escopar por `CATALOGO_TENANT_SLUG`),
  para poder rodar o Cron com segurança nos dois deploys sem duplicar. Enquanto
  não feito, siga a recomendação da seção de Cron.
- **Falha fechada no login admin sem Supabase** (o verify abre sessão de gestor
  se o Supabase não estiver configurado). Corrigir para recusar, como o login do
  fornecedor já faz.
- **Parâmetros de negócio por tenant**: hoje spread/IOF/etc. vêm de env
  (compartilhados). Migrar para `tenant_config` quando os tenants divergirem.
