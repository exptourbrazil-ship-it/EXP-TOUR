# Deploy multi-tenant (EXP Tour + Forio) — runbook

O portal opera **EXP Tour** e **Forio** como **dois deploys** (uma URL cada) sobre
o **mesmo banco Supabase**. Não é um portal multi-tenant com troca de tenant em
tempo de request: cada deploy é fixado a um tenant por variável de ambiente.

- **Fonte da verdade:** Supabase (ver [`CLAUDE.md`](../CLAUDE.md) e
  [`plano-desenvolvimento-v2.md`](./plano-desenvolvimento-v2.md)).
- **Tenant do deploy:** `CATALOGO_TENANT_SLUG` (`exp-tour` ou `forio`), resolvido
  para o id em [`tenantIdAtual()`](../src/lib/catalog-service.ts). Default `forio`.
- **Registros legados (Área do Cliente pré-multi-tenant):** `titulares.tenant_id`
  é `NULL` e, por convenção, pertencem ao tenant **EXP Tour** (ver comentário em
  [`supabase/schema.sql`](../supabase/schema.sql)). O deploy do tenant legado é o
  dono desses registros; os demais, não.

## Variáveis de ambiente por deploy

Iguais nos dois deploys (mesmo banco/segredos), **exceto** as que definem a
identidade do deploy:

| Variável | EXP Tour | Forio |
|---|---|---|
| `CATALOGO_TENANT_SLUG` | `exp-tour` | `forio` |
| `NEXT_PUBLIC_APP_URL` | URL do deploy EXP Tour | URL do deploy Forio |
| `TENANT_LEGADO_SLUG` | (opcional) `exp-tour` — default | `exp-tour` |

`TENANT_LEGADO_SLUG` marca qual deploy é dono dos registros com `tenant_id = NULL`.
Default `exp-tour`; só mude se a convenção do banco mudar. Compartilhadas nos dois:
`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, credenciais
do Mercado Pago/Resend, `SPREAD_CAMBIO_PERCENTUAL`/`IOF_CAMBIO_PERCENTUAL`, etc.

## Cron

O `vercel.json` é único (está no repositório), então **os dois deploys agendam os
mesmos crons, no mesmo horário**. Para rodar nos dois **sem duplicar efeito**, cada
cron processa **apenas o tenant do seu deploy**. `tenant_id` direto quando a tabela
tem; senão junta pela entidade que tem (padrão de dois passos de
[`cron-tenant.ts`](../src/lib/cron-tenant.ts): resolve os ids de titulares/
contratos/fornecedores do tenant e filtra com `.in()` — o mesmo padrão de
[`produto-admin-service.ts`](../src/lib/produto-admin-service.ts)).

> **Estado anterior (removido):** enquanto os crons eram globais, a recomendação
> interina era **agendar o Cron em um projeto só**. Não é mais necessário: com o
> escopo por tenant, os dois deploys rodam todos os crons.

Todos mantêm `Bearer CRON_SECRET` e **falham fechado** quando a env falta. Regra
de escopo por cron:

| Cron | Escopo | Como |
|---|---|---|
| `regua-cobranca` | por tenant | parcela→contrato→titular; contratos por titular. Escopar evita o duplo-envio em execuções concorrentes (a idempotência de `lembretes_*` só fecha no INSERT). |
| `conferir-faturas` | por tenant | `tenantIdAtual` + serviços já recebem `tenantId`. |
| `expirar-cotacoes` | por tenant | `quote.tenant_id` direto. |
| `materiais-vencidos` | por tenant | `material.tenant_id` direto. |
| `alertar-fornecedor` | por tenant (do **fornecedor**) | `supplier.tenant_id` → contratos/usuários por fornecedor. Idempotente por chave no ledger `events`. |
| `resumo-semanal-fornecedor` | por tenant (do **fornecedor**) | idem `alertar-fornecedor`. |
| `escalar-inadimplencia` | por tenant | parcela→contrato→titular. E5 idempotente (uma por contrato). |
| `escalar-incontactavel` | por tenant | documento→titular. E11 idempotente (uma por contrato). |
| `conciliar-pagamentos` | por tenant | 1ª passada: parcelas por contrato. 2ª passada (disputas): filtra os eventos pelos payment ids do tenant. Efeito de dinheiro idempotente pelo ledger. |
| `conciliar-estornos` | por tenant | estorno→acerto→contrato. Efeito idempotente. |
| `materializar-tasks` | por tenant | coleta a fila escopada pela posse (titular/contrato/fornecedor/quote); a reconciliação só conclui tarefas do tenant. **Órfãos** (alvo apagado, sem tenant atribuível) são concluídos só pelo deploy legado — preserva a limpeza que a reconciliação global fazia. |
| `alertar-eventos` | por tenant + legado pega o resto | `events` não tem `tenant_id`: atribui cada evento pela entidade (payment id→parcela→contrato; contrato/fornecedor). Alerta os do tenant; o deploy **legado** também alerta os **não atribuíveis** (external_id nulo/entidade inexistente) — nenhuma falha fica sem dono, que é a razão de o cron existir. Assunto do e-mail leva o nome do tenant do deploy. |
| `atualizar-cambio` | **global (proposital)** | `cotacoes_cambio` é referência de câmbio global (chave `moeda,data`, sem `tenant_id`); a PTAX do BCB é a mesma para todos. Upsert idempotente → rodar nos dois é inofensivo (só repete a chamada pública ao BCB). Pode ficar em um deploy só para evitar a chamada redundante. |
| `limpar-rate-limit` | **global (proposital)** | `rate_limit_hits`/`codigos_acesso` são infraestrutura de acesso (por IP/e-mail), sem `tenant_id`; a limpeza só apaga linhas velhas por tempo (idempotente). Rodar nos dois é inofensivo; pode ficar em um deploy só. |

### Notas de implementação

- **Tenant sem dados** (ex.: Forio no início): os conjuntos de ids vêm vazios e o
  cron não processa nada da Área do Cliente — comportamento desejado.
- **Falha fechada no tenant:** `resolverEscopoTenant` **recusa** se
  `CATALOGO_TENANT_SLUG` estiver ausente/vazio (diferente do resto do app, que cai
  no default `forio` só para tematização) ou se o slug não existir na tabela
  `tenant` — o cron responde 500 em vez de processar o banco inteiro ou virar
  `forio` por engano (o que deixaria nenhum deploy como legado).
- **`.in()` loteado** (`emLotes`, 500 ids) para não estourar o comprimento da URL
  do PostgREST quando as listas crescerem.
- **Sem RLS de rede:** toda a autorização é em código e as rotas usam a service
  role (ver `CLAUDE.md`). Os filtros de tenant aqui são a proteção — não o banco.

## Checklist de deploy

1. Criar/confirmar as duas linhas em `tenant` (`exp-tour`, `forio`) — ver
   [`supabase/seed-catalogo.sql`](../supabase/seed-catalogo.sql).
2. No projeto Vercel de cada deploy, setar `CATALOGO_TENANT_SLUG` e
   `NEXT_PUBLIC_APP_URL` (e `TENANT_LEGADO_SLUG` no não-legado, se o default não
   servir). As demais envs iguais.
3. Deixar o Cron **ligado nos dois** projetos (o `vercel.json` é o mesmo).
4. `npm run build` e `npm test` verdes antes de publicar (conferir o **exit code**
   do build, não a mensagem — ver `CLAUDE.md`).
