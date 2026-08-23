# Plano — Execução do Motor de Acerto (fatias 2+)

Plano da **fatia de execução** do motor de acerto: levar um acerto de
`rascunho` → `proposto` ao cliente → `aceito` (aceite eletrônico) → `executado`
(refund confirmado), cobrindo os créditos/devoluções do **E3 (downgrade)** e dos
cancelamentos **E4–E7**. É a continuação natural do que já existe: o cálculo do
acerto (rascunho + memória) e, no E3, o encaminhamento do crédito para um
rascunho de acerto.

> **Princípio inegociável (CLAUDE.md / doc 07 §4):** *dinheiro só muda de estado
> por webhook confirmado, nunca por tela.* A execução **dispara** o refund; o
> acerto só vira `executado` quando o **webhook de estorno** confirma. Nenhuma
> tela marca "devolvido".

---

## 0. O que já existe (base a reusar)

- **`acertos`** com o ciclo de vida completo no `status`:
  `rascunho | proposto | aceito | executado | cancelado`. Hoje só usamos
  `rascunho`. As fatias abaixo preenchem as transições.
- **Aceite eletrônico**: `termos` (texto versionado + `hash` SHA-256) e `aceites`
  (prova imutável: `titular_id`, `termo_id`, `versao`, `hash_conteudo`,
  `contexto`, `ip`, `user_agent`, `data_hora`, `arrependido_em`), com o campo
  genérico `aceites.proposta_id` e a rota `/api/aceite`. Reaproveitáveis para o
  aceite do **acerto** (novo `termos.tipo = 'acerto'`).
- **Barramento de eventos** `events` (idempotência/auditoria) e o padrão do
  webhook do Mercado Pago (`mp-events.ts`: validação de assinatura HMAC,
  `idempotency_key`, dedupe, tentativas, reprocessável).
- **Mercado Pago** (`mercadopago.ts`): `criarCobrancaPix`, `cancelarPagamento`,
  `consultarPagamento`. **Não há refund** — é a principal peça de infra a criar.
- **Ledger `pagamentos`** (um lançamento imutável por pagamento, com câmbio e
  BRL). O refund terá um ledger espelho (`estornos`).
- **E-mail** (`email.ts` + `email_logs`): recibo/aviso ao cliente.
- **RBAC** (`admin-roles.ts`): `financeiro.gerir`; sessão-only sem Bearer para
  ações que movem dinheiro (padrão já usado na cascata).

---

## 1. Decisões de negócio que destravam o código (pré-requisitos)

Estes **não são código** — são insumos que a execução exige. Sem eles, a fatia
fica em `proposto`/rascunho (seguro), mas não conclui.

1. **Cláusulas de retenção validadas juridicamente.** Hoje as faixas são
   `RETENCAO_PLACEHOLDER` (`provisorio=true`). Viram **config por instância
   (TENANT)** — nada hardcoded.
2. **Política de refund por fornecedor.** Quanto/quando a escola devolve
   (`Fornecedor_Politica_Visa_Refusal` e políticas de refund do cadastro do
   fornecedor, doc 05). Define o `refund_escola_esperado` real.
3. **Meio de devolução ao cliente** — ✅ **DECIDIDO: Opção A (estorno via
   Mercado Pago) com fallback manual.** Estorna o(s) pagamento(s) original(is)
   via `POST /v1/payments/{id}/refunds`, confirmado por webhook, devolvendo ao
   pagador em BRL. Casos que o MP não cobre (fora da janela, método não
   estornável, múltiplos pagadores) caem no **fallback manual**
   (`refund_meio='manual'`, `executado_manual` + comprovante). A Opção B (Pix de
   devolução avulso) foi descartada por exigir captura/validação de chave Pix
   (KYC), integração de payout e uma decisão de câmbio extra.
   - **Regra de câmbio (settlada pela Opção A):** o crédito é calculado na moeda
     do programa, mas o refund é **em BRL do que foi efetivamente pago**. Devolve
     a mesma **fração**: `refundBRL = totalPagoBRL × (saldoDevolver / totalPago)`
     (ambos em moeda do programa), particionada entre os pagamentos originais até
     cobrir o valor. Não escolhe taxa nova — usa o BRL real do ledger.
4. **Texto do "Termo/Aditivo de Acerto"** (versão + hash) para o aceite
   eletrônico — mesma validação jurídica já prevista do Termo de Adesão.

---

## 2. Fatias (ordem sugerida: menor risco → maior)

### Fatia A — Retenção parametrizada (tira o PLACEHOLDER) · sem dinheiro · ✅ CONCLUÍDA
- Tabela `config_retencao` (uma linha vigente; portal single-tenant) com as
  faixas + `tipos_sem_retencao` + `validado_juridicamente`.
- `determinarRetencaoPercentual` passa a ler a config (via
  `carregarConfigRetencao`); `RETENCAO_PLACEHOLDER` vira só o fallback (config
  ausente **ou malformada** → placeholder + `provisorio=true`).
  `provisorio=false` só quando `validado_juridicamente=true` (a memória some o
  aviso dourado).
- Rota gestor-only `GET/PUT /api/admin/config/retencao` (`config.gerir`, sessão
  sem Bearer) valida as faixas antes de salvar. Seed inicial = placeholder atual
  **não validado** (comportamento inalterado até a validação jurídica).
- **Pendente (menor):** UI admin de edição da config (hoje via a rota/SQL).
- **Risco:** baixo (não move dinheiro). **Testes:** puros (faixas por config,
  `validarFaixasRetencao`).

### Fatia B — Proposta ao cliente + aceite eletrônico · sem dinheiro · ✅ CONCLUÍDA
- **Transição `rascunho → proposto`**: rota admin (`financeiro.gerir`) que
  "propõe" o acerto — renderiza o Termo de Acerto (texto determinístico + hash),
  grava/atualiza a versão em `termos` (tipo `acerto`), vincula `acertos.termo_id`
  e marca `status='proposto'` (guarda de corrida `.eq('status','rascunho')`).
- **Área do Cliente (aba Financeiro):** um card mostra a proposta (memória, valor
  a devolver e o texto do termo) e o cliente dá o **aceite eletrônico** — grava a
  prova imutável em `aceites` (`proposta_id=acerto.id`, `contexto='area_cliente'`,
  hash recalculado/ip/ua), com **unique `(titular_id, termo_id)`** para
  idempotência atômica (duplo-clique/retry não duplica a prova). `proposto → aceito`.
- **Máquina de estados** pura (`transicaoAcertoPermitida`): só avança;
  `executado`/`cancelado` terminais. Posse revalidada no servidor (o cliente só
  aceita acerto de contrato dele).
- **Conversa de retenção** (tarefa humana) antes do aceite — conduzida à parte.
- **Não move dinheiro.** Evento em `events` em cada transição.
- **Pendente (menor):** botão admin de cancelar proposta; e-mail de confirmação
  do aceite ao cliente.
- **Risco:** baixo/médio. **Testes:** puros (máquina de estados, termo/hash).

### Fatia C — Infra de refund no Mercado Pago (wrapper + ledger + particionamento) · ✅ CONCLUÍDA
_(Meio decidido: **estorno via MP**, ver §1.3.)_
- `refundPayment(paymentId, valorBRL?)` em `mercadopago.ts`: `POST
  /v1/payments/{id}/refunds` (total ou parcial), com `X-Idempotency-Key`.
- Ledger **`estornos`**: um lançamento por refund (`acerto_id`, `pagamento_id`,
  `external_refund_id`, `valor_brl`, `status`), **único** por `(acerto_id,
  external_refund_id)` e por `(pagamento_id)` conforme o particionamento
  (idempotência).
- **Particionamento (helper PURO, testável):** dado `saldoDevolver`/`totalPago`
  (moeda) e os pagamentos do ledger (`valor_brl`), calcula `refundBRL` pela
  fração da §1.3 e o distribui entre os pagamentos (estorno total de cada um até
  o remanescente; o último pode ser parcial). A soma dos estornos = `refundBRL`.
- **Elegibilidade (helper PURO):** marca como **fluxo manual**
  (`refund_meio='manual'`, para `executado_manual` + comprovante) quando: fora da
  janela do MP, método não estornável, pagamento em disputa (E9), ou o refund não
  casa (ex.: só pagamentos manuais/sem `external_payment_id`).
- **Ainda sem "apertar o botão"** (a Fatia D dispara). Inclui uma **prévia
  read-only** do estorno no Caso 360 (admin vê meio/partição sem mover dinheiro).
  **Risco:** médio. **Testes:** puros (fração BRL, particionamento, elegibilidade,
  fallback manual).
- **Nota p/ Fatia D (achados da revisão):** escopar os pagamentos ao acerto antes
  de executar (a prévia usa todos os pagamentos do contrato); deduplicar a
  devolução manual em código (`pagamento_id` nulo não tem unique).

### Fatia D — Execução confirmada por reconsulta (money out) · ✅ CONCLUÍDA
- **Transição `aceito → executado` só por confirmação.** `executarAcerto`
  (rota **sessão, sem Bearer**, `financeiro.gerir`) dispara o(s) refund(s) da
  Fatia C, grava os `estornos` e **só marca `executado`** quando TODOS confirmam.
- **Confirmação por reconsulta ao MP** (cron `conciliar-estornos`, `30 15 * * *`):
  reconsulta cada estorno MP pendente; ao MP retornar `approved`, marca
  `confirmado`; quando todos confirmam, finaliza o acerto (update atômico
  `.eq('status','aceito')`) e envia o recibo. Falha **fechada** (CRON_SECRET).
  _(A confirmação é por reconsulta autoritativa, mesmo padrão do
  `conciliar-pagamentos`; um webhook dedicado de estorno pode ser somado depois
  para imediatismo.)_
- **Devolução MANUAL:** `executarAcerto` registra a intenção (unique
  `uidx_estornos_manual`); `confirmarDevolucaoManual` (comprovante) finaliza.
- **INERTE por segurança:** recusa acerto **provisório** (`provisorio=true`) —
  só move dinheiro após a retenção validada juridicamente (§6.3).
- **Guardas anti-duplicação** (revisão): estorno MP idempotente por
  `(acerto_id, pagamento_id)` + `X-Idempotency-Key` + **não redispara** o que já
  tem `refund_id`; manual único por acerto (banco); **bloqueia coexistir** MP e
  manual no mesmo acerto (evita devolver 2x se o meio mudar).
- **Recibo de devolução** ao cliente (best-effort, `email.ts`).
- **Risco:** alto (dinheiro sai) — mitigado pelas guardas + inércia por provisório.
- **Recuperação:** estorno `erro` ou `pendente sem refund_id` é recuperado por
  **reexecução idempotente** (visível no ledger; o acerto fica `aceito` até
  finalizar). **Testes:** puros (confirmação, "todos confirmados").

### Fatia E — Aditivo de compra avulso (E3, money in) · menor/opcional
- Alternativa ao *folding* atual: cobrança Pix **dedicada** para o delta positivo
  do E3, com aceite (aditivo de compra). Reusa `criarCobrancaPix`/`gerar-cobranca`
  + `aceites`. Entrada de dinheiro **já** é webhook-confirmada, então o risco é
  baixo; é sobretudo UX/rotulagem.

---

## 3. Máquina de estados do acerto (alvo)

```
rascunho ──propor(termo)──▶ proposto ──aceite eletrônico──▶ aceito
                                 │                              │
                                 └──────── cancelar ───────┐    ├─ disparar refund(s)
                                                           ▼    ▼
                                                       cancelado   (aguarda webhook)
                                                                        │
                                                        webhook de estorno confirma
                                                                        ▼
                                                                   executado
```
- Transições só avançam; `cancelado` é terminal. Cada transição: valida papel →
  executa → evento em `events` → trilha em `admin_audit` → notificação.

---

## 4. Banco (novo, a aplicar quando a fatia for construída)

- **`estornos`** (ledger de refunds): `id`, `acerto_id`, `pagamento_id`,
  `external_refund_id`, `valor_programa`, `valor_brl`, `status`, `criado_em`;
  **único** `(acerto_id, external_refund_id)`.
- **`termos.tipo`** ganha `'acerto'` (reusa a tabela); `aceites.proposta_id`
  aponta para o `acerto.id`.
- **`acertos`**: colunas de execução (`proposto_em`, `aceito_em`, `executado_em`,
  `termo_id`, e `refund_meio` = `mp | manual`).
- Índices/uniques parciais no padrão já usado (idempotência de estado).

---

## 5. Invariantes e guardas (transversais)

- **Dinheiro só por webhook confirmado.** Execução dispara; webhook confirma.
- **Idempotência** em cada transição e em cada refund (ledger + `idempotency_key`).
- **Aceite é pré-condição** de execução; aceite é prova imutável (`aceites`).
- **Autorização em código**: propor/executar = `financeiro.gerir` por **sessão,
  sem Bearer** (como a cascata). Override sensível exige justificativa registrada
  (doc 07).
- **Posse por titular** em toda rota; nunca cruza titulares.
- **`valor_original` nunca sobrescrito**; parcelas pagas nunca tocadas.
- **Estados sempre ícone + cor + texto**; dourado só para atenção; vermelho só no
  admin.

---

## 6. Decisões abertas (precisam de definição antes da Fatia D)

1. ✅ **RESOLVIDO — Meio de refund:** estorno via MP + fallback manual (§1.3).
2. ✅ **RESOLVIDO — Refund parcial / múltiplos pagamentos:** fração em BRL
   (§1.3) particionada entre os pagamentos originais até cobrir o valor.
3. **Retenção e política de refund por fornecedor** (jurídico + cadastro) —
   ainda aberto (a Fatia A já parametriza; falta marcar validado + a política).
4. **Texto do Termo/Aditivo de Acerto** (versão + hash) — a Fatia B já renderiza
   um termo funcional; falta a versão jurídica final.
5. **Janela de estorno do MP** (parâmetro operacional) — confirmar o limite atual
   para decidir a partir de quando cai no fallback manual (não bloqueia a Fatia C:
   o helper de elegibilidade já trata "fora da janela").

---

## 7. Sequência recomendada

**A (config de retenção)** → **B (proposta + aceite, sem dinheiro)** → **C
(wrapper de refund + ledger)** → **D (webhook + execução confirmada)** → **E
(aditivo avulso, opcional).**

A ordem coloca todo o valor **sem risco de dinheiro** (A, B) antes de qualquer
peça que mova caixa (C, D), e cada fatia é entregável e testável isoladamente.
As Fatias A–C podem ser construídas já; a Fatia D depende das decisões do §6.

> **Estado:** Fatias A, B, C e D **concluídas**. O ciclo do acerto está completo
> ponta a ponta (rascunho → proposta → aceite → execução do refund confirmada),
> mas **inerte** até: (1) a retenção ser validada juridicamente (§6.3, flip de
> `validado_juridicamente`), (2) `MERCADOPAGO_ACCESS_TOKEN` com permissão de
> estorno. Só falta a **Fatia E** (aditivo avulso, opcional).
