# Estado do Portal — arquitetura como construída

Retrato do que **existe em produção hoje**, o que foi endurecido e o que falta.
Complementa o [`plano-desenvolvimento-v2.md`](./plano-desenvolvimento-v2.md),
que descreve a intenção: este documento descreve o resultado.

**Última atualização:** 15 de agosto de 2026.
**Commit de referência:** `f2bf8aa` (PR #62).

---

## 1. Números do sistema

| | |
|---|---|
| Rotas de API | 45 |
| Módulos em `src/lib` | 43 |
| Testes unitários | 157 (runner nativo do Node) |
| Tabelas no Supabase | 26, todas com RLS habilitado |
| Jobs agendados (Vercel Cron) | 5 |

## 2. Stack

- **Next.js 16** (App Router) + TypeScript + Tailwind. *(O `CLAUDE.md` dizia 14
  até 14/08; o instalado é 16.2.x.)*
- **Supabase** — Postgres + Storage. Fonte de verdade operacional.
- **Vercel** — deploy e Cron. Plano **Hobby** (ver dívidas, seção 8).
- **Resend** — e-mails transacionais, com log em `email_logs`.
- **Mercado Pago** — Pix por QR Code dinâmico, via API `/v1/payments`.
- **Zoho** (CRM / Sign / Books) — camada comercial. CRM ativo para
  provisionamento; Sign ainda inativo.

## 3. Decisões de arquitetura vigentes

**Supabase é a fonte de verdade; o Zoho é camada comercial sincronizada.**
Sincronização unidirecional por domínio — o Zoho nunca vira segunda verdade.

**Todo acesso ao banco usa a service role.** As 26 tabelas têm RLS habilitado
**sem policies**, o que nega tudo para a chave anon. A consequência é
importante e precisa ficar explícita: **não existe rede de proteção no banco**.
Toda decisão de autorização é feita em código de aplicação. Uma rota que
esqueça de checar posse expõe dado de outro cliente, e o Postgres não vai
impedir.

**Barramento de eventos.** A tabela `events` é o ledger de idempotência e
auditoria de eventos externos: chave `idempotency_key` única, `payload` bruto,
`status` (`pendente`/`processado`/`ignorado`/`erro`), `tentativas`, `erro`,
`processed_at`. Consumidores novos devem seguir o mesmo padrão.

**Falha fechada.** Rotas protegidas por segredo de ambiente recusam quando a
variável está ausente, em vez de degradar para "sem autenticação". Isso vale
para os 5 crons e para os webhooks de Mercado Pago, Zoho CRM, Zoho Sign e
WhatsApp. Ver seção 7 para a lista de variáveis obrigatórias.

## 4. Fluxos críticos

### 4.1 Pagamento (Pix / Mercado Pago)

```
cliente pede cobrança
  └─ POST /api/parcelas/[id]/gerar-cobranca   (sessão do titular; checa posse)
       ├─ converte a parcela para BRL pela cotação VET do dia
       ├─ cria pagamento Pix na API do MP, com external_reference = parcela.id
       └─ grava external_payment_id, QR code e valor_cobrado_brl na parcela

cliente paga
  └─ MP notifica  POST /api/webhooks/mercadopago
       ├─ valida assinatura HMAC (x-signature) — falha fechada
       ├─ grava o evento em `events` (idempotência)
       ├─ RECONSULTA o pagamento na API do MP (nunca confia no corpo)
       └─ se aprovado: marca parcela paga, grava ledger em `pagamentos`,
          envia recibo itemizado

rede de segurança
  └─ cron diário /api/cron/conciliar-pagamentos varre parcelas não pagas com
     external_payment_id e regulariza o que estiver aprovado
```

**Por que a rede de segurança existe:** em agosto de 2026 o webhook estava
cadastrado na aplicação errada do Mercado Pago (a conta tem duas), então o MP
nunca teve para onde notificar. Oito pagamentos aprovados — R$ 13.116,18 —
ficaram sem registro por semanas. O cron de conciliação existe para que a
entrega não dependa de um único ponto de configuração: ele varre o MP
independentemente de webhook.

Durante o incidente também enviávamos uma `notification_url` em cada cobrança,
como segundo canal de entrega. Depois que o webhook do painel foi cadastrado na
aplicação **dona do pagamento** (a `EXP Tour - Pix`), os dois canais passaram a
entregar a MESMA notificação: a do painel validava a assinatura e a do
`notification_url` caía como `assinatura-invalida`, poluindo o ledger e
disparando o alerta diário. Por isso o `notification_url` foi **removido** — a
entrega ficou só no webhook do painel (assinatura conferida) e o cron cobre a
falha. O helper `notificationUrl()` continua no código, testado, mas não é mais
enviado.

### 4.2 Autenticação

**Cliente:** CPF → código de 6 dígitos por e-mail → sessão HMAC em cookie
httpOnly (30 dias). Códigos gerados com `crypto.randomInt`, gravados como
**HMAC** (nunca em claro), invalidados quando um novo é pedido, expurgados
após 24h pelo cron de limpeza. Limite de 5 tentativas por código e rate limit
por IP e por CPF.

**Admin:** e-mail → código de 6 dígitos, validado contra um token assinado em
cookie (sem estado no servidor). Limite de 5 tentativas por token e 10 por IP,
falhando fechado. Existe também um caminho usuário+senha por variável de
ambiente, com limite por IP. Falhas de autenticação são auditadas.

### 4.3 Documentos

Buckets privados (`documentos-titular`, `documentos-admin`,
`documentos-contratos`), servidos por URL assinada de 60s com **download
forçado** — nada é servido inline, para que HTML enviado por um cliente não
execute na origem do Supabase.

Upload valida o conteúdo por **magic bytes** (PDF/JPG/PNG/WEBP), não pelo
content-type declarado, com teto de 10 MB. A chave do objeto é derivada de
UUID: nenhum byte do nome enviado entra nela, porque a `storage-js` não escapa
`..` e um nome como `../../../../documentos-admin/x.html` gravava em outro
bucket.

Leitura de documento por admin é auditada (`documento.ler`, `documento.listar`).

### 4.4 Cancelamento de contrato

Soft, com `cancelado_em` / `cancelado_tipo` / `cancelado_motivo` /
`cancelado_por`. Aceita **data efetiva retroativa** — o cancelamento costuma ser
comunicado dias antes de alguém registrar, e essa data define a contagem dos 7
dias do direito de arrependimento. Contrato cancelado sai da régua de cobrança
e some das telas do cliente. Reversível.

Nota: `/api/aceite/arrependimento` é iniciada **pelo cliente** e apenas registra
o ato, avisando a equipe — ela não cancela nada, por design.

## 5. Segurança — postura atual

Auditoria OWASP Top 10 completa em 14/08/2026: 22 achados confirmados, 3
críticos. Relatório completo fora do repositório; resumo do que foi corrigido:

| Achado | Estado |
|---|---|
| Login admin força-brutável em ~75 min (sem contador de tentativas) | Corrigido |
| Webhook do Zoho CRM aceitava escrita de qualquer origem | Corrigido |
| `/api/test-pix-sandbox` pública em produção criando Pix real | Rota removida |
| Travessia de caminho no upload (gravava em outro bucket) | Corrigido |
| Upload sem allowlist de tipo nem teto de tamanho | Corrigido |
| Códigos de acesso com `Math.random()` | `crypto.randomInt` |
| Códigos de cliente em texto claro, tabela nunca expurgada | HMAC + expurgo |
| Nenhum cabeçalho de segurança (clickjacking em `/admin/*`) | CSP + 5 headers |
| Fail-open em 4 crons e 3 webhooks | Fail-closed |
| Rate limiter não atômico e fail-open | Corrigido |
| IP do rate limit vindo do primeiro `X-Forwarded-For` | `x-vercel-forwarded-for` |
| `contratoId` sem checagem de posse em `/api/nps` e `/embarque/checklist` | Corrigido |
| Webhook do WhatsApp sem assinatura; PII em log | Corrigido |
| Leitura de documento por admin sem auditoria | Corrigido |
| Nenhum canal de alerta | Cron `alertar-eventos` |
| `nanoid` com vulnerabilidade alta | `npm audit fix` |

**O que veio limpo:** nenhum segredo no repositório em 275 commits; nenhuma
injeção SQL/PostgREST; nenhum SSRF; nenhum `dangerouslySetInnerHTML`; nenhum
IDOR nas rotas de parcela, documento e aceite; validação de assinatura do
Mercado Pago correta, com reconsulta do estado real do pagamento.

## 6. Jobs agendados

| Job | Horário (UTC) | O que faz |
|---|---|---|
| `atualizar-cambio` | 18:00 | Busca a cotação do dia e grava em `cotacoes_cambio` |
| `regua-cobranca` | 12:00 | Lembretes de parcela (D-3, D0, D+1, D+5) e de quitação (D-30/15/5) |
| `conciliar-pagamentos` | 15:00 | Rede de segurança do webhook do MP |
| `alertar-eventos` | 16:00 | Alerta por e-mail se houver evento com status `erro` |
| `limpar-rate-limit` | 04:00 | Expurga `rate_limit_hits` e `codigos_acesso` |

Todos exigem `Bearer CRON_SECRET` e recusam se a variável não existir.

## 7. Variáveis de ambiente obrigatórias

Ausência faz a rota correspondente recusar (503), não degradar:

| Variável | Consequência se faltar |
|---|---|
| `CRON_SECRET` | Os 5 crons recusam |
| `MERCADOPAGO_WEBHOOK_SECRET` | Webhook do MP recusa |
| `ZOHO_WEBHOOK_SECRET` | Webhook do Zoho CRM recusa |
| `ZOHO_SIGN_WEBHOOK_SECRET` | Webhook do Zoho Sign recusa |
| `WHATSAPP_APP_SECRET` | Webhook do WhatsApp recusa |
| `NEXT_PUBLIC_APP_URL` | Logo dos e-mails cai para texto |
| `SESSION_SECRET` | Sessões e hash de código quebram |

O segredo do webhook do Mercado Pago precisa ser o da **mesma aplicação** do
`MERCADOPAGO_ACCESS_TOKEN`. Foi exatamente esse descasamento que causou o
incidente de agosto.

## 8. O que falta

### Prioridade alta

1. **Revogação de sessão.** Token de 30 dias autocontido, sem `jti` nem versão:
   o logout só apaga o cookie, e um token capturado vale 30 dias. Revogar hoje
   exige rotacionar `SESSION_SECRET` e deslogar todo mundo. A correção pede
   checagem assíncrona contra o banco em toda requisição — `verificarSessao` é
   função pura usada em dezenas de lugares —, então merece mudança própria e
   uma decisão sobre onde enforçar.

2. **Plano Vercel Pro.** O Hobby não é licenciado para uso comercial e tem
   limites baixos. O portal move dinheiro de cliente. Item 2 do Bloco 1 do
   plano v2, ainda aberto.

3. **Backups do Supabase / PITR.** Não confirmados. Para dado financeiro e
   documento de identidade, é o mínimo.

### Prioridade média

4. **Enumeração de CPF.** Dois oráculos: tempo de resposta (CPF conhecido faz
   chamada ao Resend antes de responder) e status (429 para conhecido, 401 para
   desconhecido após 5 erros). Permite montar lista de CPFs de quem tem
   contrato ativo.

5. **Erros brutos devolvidos ao cliente.** `gerar-cobranca` repassa o JSON do
   Mercado Pago; várias rotas admin devolvem `error.message` do Postgres, com
   nomes de tabela e constraint.

6. **Escape uniforme nos templates de e-mail.** `textoTermo` é escapado, o
   resto não. Hoje só `descricao` é alcançável por cliente, e o e-mail vai para
   ele mesmo — mas falta um helper compartilhado.

7. **Contas de admin individuais.** Hoje o painel é uma credencial única; a
   auditoria registra `rodrigo@exp-tour.com` ou `bearer-secret` para tudo.

### Produto (do plano v2, ainda abertos)

8. **Item 9** — Marco 1 no ajuste de parcelas quando existir cadastro de
   fornecedor.
9. **Item 10** — Exceções E1 (visto negado pausa cobrança) e demais.
10. **Papéis multiusuário** (pagante + estudante). Bloqueador conhecido: o
    e-mail do estudante não está na base.
11. **Zoho Sign** — falta `ZOHO_SIGN_TEMPLATE_ID` e
    `ZOHO_SIGN_ACTION_CONTRATANTE`; o envio para assinatura está desativado na
    tela de contratos.
12. **WhatsApp** — a conta Meta tem um único app (`EXP Tour`,
    `1920247635332009`) e ele **não tem o produto WhatsApp**. As variáveis de
    julho apontam para uma configuração que não existe mais. Quando for ativar:
    adicionar o produto, cadastrar o webhook, gerar token permanente por usuário
    de sistema (o de julho, se temporário, expirou) e copiar o App Secret.

### Dívidas menores

- `contratos` não tem status padronizado; `cancelado_em` é o primeiro estado
  explícito.
- `supabase/schema.sql` não reflete 100% o banco (parte do DDL foi aplicada
  pelo SQL Editor). Ao adicionar DDL, atualizar os dois.
- A coluna `codigos_acesso.codigo` (texto claro) pode ser removida — o código
  novo só escreve `codigo_hash`.
- Zoho CRM: o `access_token` falha ao renovar (`invalid_code`); a integração
  está desconectada.

## 9. Incidentes e lições

**Webhook do Mercado Pago mudo (jul–ago/2026).** O webhook estava cadastrado na
aplicação `Forio` enquanto o access token pertencia à `EXP Tour - Pix`. O MP só
notifica pela aplicação dona do pagamento. Oito pagamentos aprovados ficaram
sem registro; os clientes viam a parcela em aberto. Agravante: a rota devolvia
401 sem gravar nada, então a falha era invisível. Hoje a rejeição vira linha em
`events`, o cron de conciliação cobre a lacuna e o alerta diário avisa.

**Access token trocado por chave de outro serviço (ago/2026).** O
`MERCADOPAGO_ACCESS_TOKEN` na Vercel foi substituído por uma chave `sk_live_…`
(formato de outro provedor, não do MP). Como não é um token válido do Mercado
Pago (produção começa com `APP_USR-`), o portal não conseguia consultar
pagamentos nem gerar cobrança — "Mercado Pago não conectado". Correção: pegar o
Access Token e a Assinatura secreta **da mesma aplicação dona do pagamento**
(`EXP Tour - Pix`) e fazer redeploy. **Lição:** o token de produção do MP começa
sempre com `APP_USR-`; qualquer outro prefixo é a variável errada. Na mesma
apuração, removeu-se o `notification_url` por cobrança (ver Seção 4.1): com o
webhook do painel correto, ele virou entrega duplicada que caía como
`assinatura-invalida`. E o webhook passou a tratar pagamento inexistente (404)
como "ignorado" (200), em vez de 500, para o MP não reentregar em loop (era o que
inflava as tentativas do id fictício do "Simular notificação").

**Build quebrado por `npm audit fix` (14/08/2026).** A correção de segurança
subiu o Next de 16.2.11 para 16.3.1, e a versão nova passou a type-checkar os
`*.test.ts`, que importam com extensão `.ts` de propósito. O deploy falhou e a
produção ficou servindo a versão anterior por horas. **Lição registrada:**
`Compiled successfully` aparece no meio da saída do `next build`; o type-check
roda depois e tem exit code próprio. Conferir o exit code, não a mensagem.

**Cliente cancelada recebendo cobrança (15/08/2026).** A régua rodou às 12:00
UTC e o filtro de contratos cancelados só entrou em produção às 16:30. Uma
cliente que havia desistido recebeu lembrete de cobrança. Sem impacto
permanente, mas ilustra por que mudança de comportamento e job agendado pedem
atenção à ordem de deploy.
