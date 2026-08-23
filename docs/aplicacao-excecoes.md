# Aplicação — Módulo de Exceções (E1–E11) + Motor de Acerto e Alteração (Fatia 1)

Registro de aplicação do módulo de processos de exceção (doc 01 §4), da Fatia 1
do motor de acerto (doc 07 §3.5) e do motor de alteração (E2/E3, doc 01 §4):
prévia, **execução em cascata**, notificação do cliente e **crédito do E3 →
rascunho de acerto**. A entrega foi feita em **23 patches** de código lineares a
partir da `main` (cada patch = 1 commit), aplicáveis com `git am`. Este documento
serve de referência da ordem, do impacto no banco e da configuração. (Há ainda
patches só-de-docs — atualizações deste README e o plano de execução do acerto —
que não alteram código e podem ser aplicados por último.) Já inclui a **Fatia A**
da execução do motor de acerto (retenção parametrizada; ver
[`plano-execucao-acerto.md`](./plano-execucao-acerto.md)).

> **Banco:** todas as mudanças de schema **já foram aplicadas na produção**
> (Supabase) durante a sessão. Para um banco **novo**, o `supabase/schema.sql`
> (atualizado pelos patches) cobre tudo. Ver a seção "Banco de dados" abaixo.

---

## 1. Pré-requisitos

- Base: `main` limpa (os patches aplicam em sequência sobre ela).
- Node do projeto; `npm install` já feito.
- É a continuação da **Fatia 2 do Caso 360** (primeiro patch da cadeia).

## 2. Ordem de aplicação

Coloque os 23 arquivos `.patch` num diretório e rode, na ordem:

```bash
git checkout main && git pull
git checkout -b claude/excecoes            # branch de integração (nome à sua escolha)

git am caso-360-fatia2.patch
git am excecao-modelo.patch
git am excecao-suspensao-cobranca.patch
git am excecao-e1-visto.patch
git am fila-excecoes.patch
git am excecao-e9-disputa.patch
git am excecao-e4-cancelamento.patch
git am excecao-e5-inadimplencia.patch
git am excecao-e6-escola.patch
git am excecao-e8-forca-maior.patch
git am excecao-e10-hold-fraude.patch
git am excecao-e11-incontactavel.patch
git am motor-acerto-fatia1.patch
git am excecao-e2-deferral.patch
git am excecao-e3-e7.patch
git am motor-alteracao-fatia1.patch
git am motor-alteracao-e3-fatia1.patch
git am motor-alteracao-cascata.patch
git am motor-alteracao-notificacao.patch
git am e3-credito-acerto.patch
git am acerto-fatia-a-retencao-config.patch
git am acerto-fatia-b-proposta-aceite.patch
git am acerto-fatia-c-refund-infra.patch
```

Alternativa (aplicar todos de uma vez, se estiverem só nesse diretório):

```bash
git am *.patch      # o glob ordena por nome; ver a nota de nomeação abaixo
```

> **Nota de nomeação:** o glob aplica em ordem alfabética, que **não** é a ordem
> correta. Prefira a lista explícita acima, ou renomeie com prefixo numérico
> (`01-…`, `02-…`) antes de usar `git am *.patch`.

Se um `git am` falhar: `git am --abort` e reaplique conferindo a ordem. Nenhum
patch depende de estado externo — só da cadeia anterior.

## 3. O que cada patch entrega

| # | Patch | Commit | Entrega |
|---|-------|--------|---------|
| 1 | `caso-360-fatia2` | e589993 | Caso 360 Fatia 2: análise de documento inline (aprovar/rejeitar c/ motivo + aviso), reenviar acesso, gating RBAC |
| 2 | `excecao-modelo` | 2784be1 | Modelo de exceção (tabela `case_exceptions`, máquina de estados pura E1–E11, serviço abrir/mudar-status) + wiring no Caso 360 |
| 3 | `excecao-suspensao-cobranca` | 599062d | Régua de cobrança respeita a suspensão da exceção (pausa cobrança/lembretes) |
| 4 | `excecao-e1-visto` | 22b37b7 | **E1** visto negado: `contratos.visto_status`, abre E1 (idempotente) → pausa cobrança + tarefa consultor + e-mail empático |
| 5 | `fila-excecoes` | 327cb07 | Fila do Dia lista exceções abertas por idade, roteadas por papel-alvo (SLA por tipo) |
| 6 | `excecao-e9-disputa` | 1731521 | **E9** disputa MP (MED Pix/chargeback): `parcelas.em_disputa`, webhook detecta e congela o efeito, ledger `dispute:<id>` |
| 7 | `excecao-e4-cancelamento` | 6bb6d37 | **E4** cancelamento pelo cliente: arrependimento e ação admin abrem E4 (pausa cobrança). Régua passa a falhar fechada na leitura de suspensões |
| 8 | `excecao-e5-inadimplencia` | 86eb6f4 | **E5** inadimplência: cron D+30 abre E5 + tarefa ao Financeiro (notificação formal). Novo cron |
| 9 | `excecao-e6-escola` | eba029f | **E6** cancelamento pela escola: ação admin abre E6 + pausa + e-mail proativo |
| 10 | `excecao-e8-forca-maior` | 3f9bd03 | **E8** força maior em lote (só-gestor): `/admin/forca-maior` com preview → aplica E8 + comunicação padronizada |
| 11 | `excecao-e10-hold-fraude` | a680b76 | **E10** hold de verificação: trava avanço (guard `avancoSuspenso` bloqueia enviar contrato p/ assinatura) |
| 12 | `excecao-e11-incontactavel` | ca71bc7 | **E11** incontactável: `documentos.rejeitado_em`, ação manual + cron (doc rejeitado ≥30d sem reenvio). Novo cron |
| 13 | `motor-acerto-fatia1` | f1380e7 | Motor de acerto Fatia 1: tabela `acertos`, cálculo de retenção/saldo (placeholder) + memória de cálculo (rascunho) no Caso 360 |
| 14 | `excecao-e2-deferral` | e2005d3 | **E2** adiamento de início: ação admin abre E2 (suspende avanço) + data solicitada |
| 15 | `excecao-e3-e7` | b9d0f7a | **E3** alteração de escopo e **E7** interrupção: ações rotuladas no Caso 360 (reusam a rota genérica de exceção) |
| 16 | `motor-alteracao-fatia1` | 7fc4c79 | **Motor de alteração — E2 (adiamento):** prévia do plano recalculado (nova data-limite D-30 + reagendamento do saldo em aberto), rascunho revisado. Tabela `alteracoes`; exige E2 ativo |
| 17 | `motor-alteracao-e3-fatia1` | 23f29ca | **Motor de alteração — E3 (escopo):** prévia do delta financeiro nos dois sentidos (aditivo / crédito / neutro) + plano recalculado, rascunho. Exige E3 ativo; capacidade `financeiro.gerir` |
| 18 | `motor-alteracao-cascata` | 265218b | **Motor de alteração — execução em cascata (E2/E3):** aplica o rascunho reescrevendo as parcelas em aberto + atualiza o contrato (data de início / valor_total) + marca aplicada, tudo **em transação** (função SQL `aplicar_alteracao`). Guardas de dinheiro (Pix/disputa/cancelado/crédito→acerto/soma). Só-sessão `financeiro.gerir`, sem Bearer |
| 19 | `motor-alteracao-notificacao` | adbc62a | **Notificação ao cliente:** ao aplicar a cascata, e-mail com o resumo do novo cronograma (best-effort, log em `email_logs`); atualiza este README |
| 20 | `e3-credito-acerto` | 7855b0c | **Perna de dinheiro do E3 — crédito → acerto:** quando o downgrade gera crédito (já pago > novo), gera um **rascunho de acerto/refund** (reusa a tabela `acertos`, sem retenção) para o Financeiro revisar. NÃO executa refund. Índice de rascunho de acerto passa a ser por `(contrato_id, excecao_id)`; capacidade `financeiro.gerir` |
| 21 | `acerto-fatia-a-retencao-config` | 910d626 | **Execução do acerto — Fatia A (retenção parametrizada):** tabela `config_retencao` (faixas + tipos-sem-retenção + validação jurídica); o motor lê da config, `provisorio` reflete `validado_juridicamente`. Rota gestor-only `config.gerir`. Seed = placeholder não validado (comportamento inalterado) |
| 22 | `acerto-fatia-b-proposta-aceite` | 131e626 | **Execução do acerto — Fatia B (proposta + aceite eletrônico):** rascunho→proposto (admin renderiza Termo de Acerto texto+hash em `termos`, `financeiro.gerir`) → aceito (cliente aceita na Área do Cliente, prova imutável em `aceites` com unique `(titular_id, termo_id)`). Máquina de estados pura. NÃO move dinheiro |
| 23 | `acerto-fatia-c-refund-infra` | _(este)_ | **Execução do acerto — Fatia C (infra de estorno):** `refundPayment` (wrapper MP), ledger `estornos`, planejamento puro do refund (fração BRL + particionamento + fallback manual) e **prévia read-only** no Caso 360. Meio decidido: estorno via MP. NÃO dispara refund (isso é a Fatia D) |

## 4. Banco de dados

Já aplicado na **produção** durante a sessão; o `supabase/schema.sql` (atualizado
pelos patches) reproduz tudo para um banco novo. DDL, por patch:

- **#1** `documentos.motivo_rejeicao text`
- **#2** tabela `case_exceptions` (+ `idx_contrato`, `idx_titular`, índice parcial de ativas, **índice único parcial** `uidx_case_exceptions_ativa (contrato_id, tipo) where status in ('aberta','em_andamento')`) — RLS habilitado sem policy
- **#4** `contratos.visto_status text check (null | em_analise | aprovado | negado)`
- **#6** `parcelas.em_disputa boolean default false`, `parcelas.disputa_status text`
- **#12** `documentos.rejeitado_em timestamptz`
- **#13** tabela `acertos` (+ índices; **índice único parcial** `uidx_acertos_rascunho (contrato_id) where status='rascunho'`) — RLS habilitado sem policy
- **#16** tabela `alteracoes` (rascunho do plano recalculado; + `idx_contrato`, `idx_titular`, **índice único parcial** de rascunho) — RLS habilitado sem policy
- **#17** `alteracoes`: coluna `tipo` (`deferral`|`escopo`) + campos do delta do E3 (`valor_programa_atual`, `valor_programa_novo`, `delta`, `ja_pago`, `credito_cliente`, `sentido`); o índice único de rascunho passa de `(contrato_id)` para `(contrato_id, tipo)` (E2 e E3 coexistem)
- **#18** `alteracoes.aplicada_em timestamptz`, `alteracoes.aplicada_por text`; **função** `aplicar_alteracao(...)` (plpgsql, transacional: reescreve parcelas + contrato + `events` + `admin_audit`). Reaplicar recria a função (`drop function` da assinatura antiga + `create or replace`)
- **#20** `uidx_acertos_rascunho` passa de `(contrato_id)` para `(contrato_id, excecao_id)` — um rascunho de acerto por exceção, para o crédito do E3 e um cancelamento (E4-E7) coexistirem sem se sobrescrever. Sem novas colunas (reusa `acertos`)
- **#21** tabela `config_retencao` (faixas jsonb, `tipos_sem_retencao` jsonb, `validado_juridicamente`, `vigente`) + **índice único parcial** `uidx_config_retencao_vigente (vigente) where vigente=true` + **seed** idempotente com o placeholder atual (não validado) — RLS habilitado sem policy
- **#22** `acertos`: `proposto_em`, `aceito_em`, `termo_id` (sem FK — `termos` vem depois no arquivo); **índice único** `uidx_aceites_titular_termo (titular_id, termo_id)` em `aceites` (idempotência atômica do aceite). Reusa `termos`/`aceites` existentes
- **#23** `acertos`: `refund_meio`, `executado_em`; tabela `estornos` (ledger de refunds; + `idx_estornos_acerto`, **índices únicos parciais** `uidx_estornos_acerto_pagamento (acerto_id, pagamento_id)` e `uidx_estornos_refund (external_refund_id)`) — RLS habilitado sem policy

> Reaplicar em produção é seguro: todo DDL usa `if not exists` / `add column if
> not exists`. Se for um banco novo, basta rodar o `schema.sql` atualizado.

## 5. Configuração (env + cron)

**Novos crons** (já incluídos no `vercel.json` pelos patches #8 e #12):

- `/api/cron/escalar-inadimplencia` — `0 13 * * *` (E5)
- `/api/cron/escalar-incontactavel` — `0 14 * * *` (E11)

Ambos exigem `CRON_SECRET` (falha fechada) como os demais crons.

**Variáveis opcionais** (têm default; caem no default se ausentes/ inválidas):

- `INADIMPLENCIA_DIAS` (default `30`) — limiar do E5
- `INCONTACTAVEL_DIAS` (default `30`) — limiar do E11

Usam infra já existente: `RESEND_*` (e-mails de E1/E6/E8 e o **novo cronograma**
ao aplicar a cascata — log em `email_logs`, tipo `cronograma_atualizado`),
`NEXT_PUBLIC_APP_URL` (link do portal nos e-mails), `MERCADOPAGO_WEBHOOK_SECRET`
(E9). A cascata (#18) e a notificação (#19) não exigem env nova.

## 6. Verificação pós-aplicação

```bash
npm run build     # deve terminar com exit code 0 (conferir o EXIT, não a mensagem)
npm test          # 339 testes, todos passando
```

## 7. Cobertura e pendências

**Automatizado (E1–E11):**
- E1 visto negado · E2 adiamento · E3 alteração de escopo · E4 cancelamento cliente ·
  E5 inadimplência · E6 cancelamento escola · E7 interrupção · E8 força maior ·
  E9 disputa · E10 hold fraude · E11 incontactável.
- Mais: modelo/máquina de estados, suspensão efetiva da cobrança, Fila do Dia por
  idade/dono, **Motor de acerto Fatia 1** (cálculo + memória, rascunho) e o
  **Motor de alteração completo (E2/E3): prévia → execução em cascata → notificação:**
  - **Prévia (rascunho revisado):** E2 (adiamento) recalcula a data-limite de
    quitação (D-30 do novo início) + reagenda o saldo em aberto; E3 (escopo)
    calcula o delta financeiro nos dois sentidos — aditivo, crédito ou neutro —
    + plano sobre o novo saldo. Novo valor do programa informado pela
    Operação/Financeiro (não há motor de preço integrado neste portal).
  - **Execução em cascata (aplicar):** reescreve as parcelas em aberto, atualiza
    o contrato (data de início no E2; `valor_total` no E3) e marca aplicada, em
    **transação** (função `aplicar_alteracao`). Parcelas pagas intocadas; sem Pix
    órfão; contrato cancelado recusado; crédito (E3, já pago > novo) encaminhado
    ao motor de acerto; dinheiro só muda por webhook (só cria cobranças a vencer).
  - **Notificação:** e-mail ao cliente com o resumo do novo cronograma (best-effort).
  - **Crédito do E3 → acerto:** quando o downgrade deixa já pago > novo valor, um
    clique gera o **rascunho de acerto/refund** (sem retenção) na mesma superfície
    do Financeiro. Só rascunho — a execução do refund segue deferida.

**Deferido (peças grandes, transversais):**
- **Motor de alteração — pernas de dinheiro do E3 (restante):** o **aditivo de
  compra** como cobrança complementar avulsa via checkout com aceite (hoje o delta
  positivo entra embutido nas parcelas a vencer) e a **execução do refund** do
  crédito (hoje o crédito vira rascunho de acerto, mas o dinheiro não sai). A
  variante do E3 que também desloca a data de início ("+nova data") também fica
  para depois.
- **Motor de acerto, fatias 2+** — proposta no portal → aceite eletrônico →
  execução/refund (inclui o crédito do E3). **Fatias A, B e C entregues**:
  retenção parametrizada; proposta + aceite eletrônico (`rascunho→proposto→aceito`);
  e a infra de estorno (`refundPayment`, ledger `estornos`, planejamento do refund
  + prévia read-only). **Meio decidido**: estorno via MP + fallback manual. Falta:
  **Fatia D** (execução confirmada por webhook de estorno), validar juridicamente
  as cláusulas (marcar a config) e a política de refund por fornecedor. Ver
  [`plano-execucao-acerto.md`](./plano-execucao-acerto.md).
- **Portal do fornecedor** — gatilho do E6 (escola registra) e aprovação de E2/E3.

## 8. Notas de arquitetura

- **Dinheiro só muda por webhook confirmado, nunca por tela.** Nenhuma ação
  desta entrega executa refund, cobra ou marca pagamento. O acerto só grava
  rascunho. A execução em cascata do motor de alteração **reescreve o cronograma**
  (parcelas a vencer), mas nunca marca pagamento nem toca parcela paga: o dinheiro
  continua entrando só pelo webhook do Mercado Pago quando cada parcela é paga.
- **Mutação em transação (doc 07 §4).** A cascata roda numa função SQL atômica
  (`aplicar_alteracao`): valida sob lock → reescreve parcelas + contrato → grava
  `events` → grava `admin_audit`, tudo junto. A notificação ao cliente é o único
  passo best-effort (fora da transação, pós-commit).
- **Autorização em código** (RLS sem policy): rotas checam capacidade
  (`casos.gerir`, `cancelamento.gerir`, `financeiro.gerir`, `config.gerir`) e
  posse por titular. E8 (força maior) e a **execução da cascata** são só-sessão
  **sem** fallback Bearer (ações de maior alcance / mais sensíveis a dinheiro).
- **Suspensão cessa sozinha:** ao resolver/cancelar a exceção, ela deixa de ser
  ativa e a cobrança/avanço voltam — sem religar nada.
- **Regras de retenção vêm de config por instância** (`config_retencao`, Fatia
  A): enquanto `validado_juridicamente=false`, o acerto marca `provisorio=true` e
  a memória sinaliza isso na tela. Config ausente ou malformada cai no placeholder
  (também provisório) — nunca em retenção 0% silenciosa.
