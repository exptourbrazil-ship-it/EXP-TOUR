# CLAUDE.md — Portal EXP Tour (Área do Cliente)

Orientação para o Claude Code trabalhar neste repositório. Leia junto com os
documentos em [`/docs`](./docs/README.md).

## O que é

Portal em produção da **Área do Cliente** da EXP Tour (projeto "Forio"): login
do cliente (CPF + código por e-mail) e admin, parcelas com ajuste /
antecipação / pagamento via Pix, cofre de documentos com taxonomia, contagem
regressiva e regras de negócio (ex.: "regra dos 30 dias" para a quitação).

## Stack

- **Next.js 14** (App Router) + **TypeScript** + **Tailwind**.
- **Supabase** (Postgres + Storage) — **fonte de verdade operacional**.
- **Vercel** (deploy + Cron).
- **Resend** (e-mails) — hoje envia códigos de acesso; motor de régua de
  cobrança ainda por construir.
- **Mercado Pago** (Pix, QR Code dinâmico) — pagamentos.
- **Zoho** (CRM / Sign / Books) — camada comercial, **ainda inativa**
  (aguardando credenciais). Não está no caminho crítico.

## Decisão de arquitetura (ver `docs/plano-desenvolvimento-v2.md`, Seção 1)

**Supabase é a fonte de verdade; o Zoho é uma camada comercial sincronizada,**
alimentada pelo barramento de eventos como mais um consumidor. Sincronização é
sempre unidirecional por domínio — o Zoho nunca vira uma segunda verdade.
Consequência: as credenciais do Zoho não bloqueiam o caminho crítico.

## Estrutura

- `src/app/` — páginas (App Router) e rotas de API.
  - `src/app/api/webhooks/mercadopago/` — webhook de pagamentos MP (idempotente,
    com validação de assinatura; ver "Barramento de eventos" abaixo).
  - `src/app/api/parcelas/` — gerar/cancelar cobrança, ajustar, restaurar.
  - `src/app/api/admin/` — rotas administrativas (protegidas por sessão admin).
  - `src/app/api/cron/atualizar-cambio/` — job diário de câmbio (Vercel Cron,
    ver `vercel.json`).
  - `src/app/api/integrations/zoho/` — integração Zoho (inativa).
- `src/lib/` — integrações e utilitários.
  - `mercadopago.ts` — chamadas à API do MP (criar/consultar pagamento).
  - `mp-events.ts` — helpers puros do webhook: validação de assinatura HMAC,
    montagem de `idempotency_key`, extração de `paymentId`. **Testado.**
  - `session.ts` / `admin-session.ts` — sessões assinadas (HMAC) em cookie
    httpOnly. `admin-guard.ts` expõe `checarAdminCookie()` para rotas de API.
  - `email.ts` — envio via Resend + log em `email_logs`.
  - `supabaseClient.ts` — cliente anon (client-side). Nas rotas de API usa-se
    `createClient(url, SERVICE_ROLE_KEY)` para escrever com service role.
- `supabase/schema.sql` — schema de referência. **Atenção:** algumas colunas e
  tabelas foram aplicadas direto no Supabase via SQL Editor (ex.:
  `cotacoes_cambio`, `parcelas.cotacao_aplicada`, `titulares.data_inicio`,
  `email_logs`), então este arquivo pode não refletir 100% o banco. Ao adicionar
  DDL novo, atualize este arquivo E aplique no SQL Editor.

## Barramento de eventos (padrão)

A tabela `events` (Supabase) é o ledger de idempotência e auditoria de eventos
externos. Chave `idempotency_key` única (ex.: `mercadopago:payment:<id>`),
`payload` bruto, `status` (`pendente`/`processado`/`ignorado`/`erro`),
`tentativas`, `erro`, `processed_at`. O webhook do MP grava o evento, dedupe o
efeito (nunca marca a mesma parcela como paga duas vezes), registra tentativas e
pode ser reprocessado manualmente. Novos consumidores de eventos (Zoho Sign,
etc.) devem seguir o mesmo padrão.

## Convenções

- Comentários e mensagens de erro em **português**.
- Rotas que usam `crypto`/Node APIs declaram `export const runtime = "nodejs"`.
- Invariantes de negócio a preservar: **`valor_original` nunca é sobrescrito**;
  não é possível restaurar um plano com parcela já paga; **não reintroduzir
  banner de simular/antecipar câmbio** (antecipação é ação na parcela, sem
  banner promocional).
- Rotas admin autenticam com `checarAdminCookie()` (cookie de sessão admin);
  algumas aceitam, por compatibilidade, um Bearer secret de env.

## Comandos

```bash
npm install       # instala dependências
npm run dev       # desenvolvimento
npm run build     # build de produção (valida tipos via next/tsc)
npm test          # testes unitários (node:test, sem dependências extras)
```

Os testes usam o runner nativo do Node (`node --test`), que executa arquivos
`*.test.ts` diretamente por type-stripping — não há framework de teste externo.
Mantenha os helpers testáveis **puros** (sem dependência de rede/DB) para que
possam ser cobertos sem mocks pesados.

## Fluxo de trabalho

Implementar **um item do plano por vez** (Seção 3 de
`docs/plano-desenvolvimento-v2.md`), com testes e commit a cada passo.
