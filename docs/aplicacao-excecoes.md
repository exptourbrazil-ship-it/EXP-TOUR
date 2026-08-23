# Aplicação — Módulo de Exceções (E1–E11) + Motor de Acerto e Alteração (Fatia 1)

Registro de aplicação do módulo de processos de exceção (doc 01 §4), da Fatia 1
do motor de acerto (doc 07 §3.5) e da Fatia 1 do motor de alteração (E2/E3, doc
01 §4). A entrega foi feita em **17 patches** lineares a partir da `main` (cada
patch = 1 commit), aplicáveis com `git am`. Este documento serve de referência
da ordem, do impacto no banco e da configuração.

> **Banco:** todas as mudanças de schema **já foram aplicadas na produção**
> (Supabase) durante a sessão. Para um banco **novo**, o `supabase/schema.sql`
> (atualizado pelos patches) cobre tudo. Ver a seção "Banco de dados" abaixo.

---

## 1. Pré-requisitos

- Base: `main` limpa (os patches aplicam em sequência sobre ela).
- Node do projeto; `npm install` já feito.
- É a continuação da **Fatia 2 do Caso 360** (primeiro patch da cadeia).

## 2. Ordem de aplicação

Coloque os 17 arquivos `.patch` num diretório e rode, na ordem:

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

Usam infra já existente: `RESEND_*` (e-mails de E1/E6/E8), `NEXT_PUBLIC_APP_URL`
(link do portal nos e-mails), `MERCADOPAGO_WEBHOOK_SECRET` (E9).

## 6. Verificação pós-aplicação

```bash
npm run build     # deve terminar com exit code 0 (conferir o EXIT, não a mensagem)
npm test          # 319 testes, todos passando
```

## 7. Cobertura e pendências

**Automatizado (E1–E11):**
- E1 visto negado · E2 adiamento · E3 alteração de escopo · E4 cancelamento cliente ·
  E5 inadimplência · E6 cancelamento escola · E7 interrupção · E8 força maior ·
  E9 disputa · E10 hold fraude · E11 incontactável.
- Mais: modelo/máquina de estados, suspensão efetiva da cobrança, Fila do Dia por
  idade/dono, **Motor de acerto Fatia 1** (cálculo + memória, rascunho) e
  **Motor de alteração Fatia 1** (prévia recalculada, rascunho):
  - **E2 (adiamento):** nova data-limite de quitação (D-30 do novo início) +
    reagendamento do saldo em aberto na nova janela.
  - **E3 (escopo):** delta financeiro nos dois sentidos — aditivo (delta>0),
    crédito (delta<0, com refund a apurar) ou neutro — + plano recalculado sobre
    o novo saldo. Novo valor do programa informado pela Operação/Financeiro (não
    há motor de preço integrado neste portal).

**Deferido (peças grandes, transversais):**
- **Motor de alteração — execução (fatias 2+):** aplicação do rascunho em
  cascata (marcos → reescrever parcelas → aditivo/aceite); no E3, execução do
  **aditivo de compra** via checkout e do **crédito** via motor de acerto/refund.
  A variante do E3 que também desloca a data de início ("+nova data") também fica
  para depois.
- **Motor de acerto, fatias 2+** — proposta no portal → aceite eletrônico →
  execução/refund. Depende de: cláusulas de retenção validadas juridicamente
  (hoje **PLACEHOLDER**, `provisorio=true` na memória) e política de refund por
  fornecedor.
- **Portal do fornecedor** — gatilho do E6 (escola registra) e aprovação de E2/E3.

## 8. Notas de arquitetura

- **Dinheiro só muda por webhook confirmado, nunca por tela.** Nenhuma ação
  desta entrega executa refund, cobra ou marca pagamento; os motores de acerto e
  de alteração só calculam e gravam rascunho (`provisorio=true`) para revisão do
  Financeiro/Operação — não reescrevem parcelas nem geram aditivo.
- **Autorização em código** (RLS sem policy): rotas checam capacidade
  (`casos.gerir`, `cancelamento.gerir`, `financeiro.gerir`, `config.gerir`) e
  posse por titular. E8 (força maior) é só-gestor **sem** fallback Bearer.
- **Suspensão cessa sozinha:** ao resolver/cancelar a exceção, ela deixa de ser
  ativa e a cobrança/avanço voltam — sem religar nada.
- **Regras de retenção são provisórias** até a validação jurídica; a memória de
  cálculo sinaliza isso na tela.
