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
3. **Meio de devolução ao cliente** (decisão de arquitetura, ver §6):
   - **A) Estorno do pagamento original via API do Mercado Pago** (refund) —
     limitado ao método/pagamento original e à janela temporal do MP; ou
   - **B) Pix de devolução avulso** (transferência para a chave do cliente),
     fora do fluxo de estorno do MP.
   A escolha muda a Fatia C/D.
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

### Fatia B — Proposta ao cliente + aceite eletrônico · sem dinheiro
- **Transição `rascunho → proposto`**: rota admin (`financeiro.gerir`, sessão)
  que "propõe" o acerto. Cria/vincula um `termos.tipo='acerto'` (texto + hash com
  a memória e as condições) e marca `acertos.status='proposto'`.
- **Área do Cliente (aba Financeiro):** o cliente vê a proposta (memória de
  cálculo, valor a devolver, prazo) e dá o **aceite eletrônico** — reusa
  `aceites` (`proposta_id = acerto.id`, `contexto='area_cliente'`, hash/ip/ua).
  Transição `proposto → aceito`.
- **Conversa de retenção** (tarefa humana) antes do aceite, conforme doc 01 §4
  (parte dos cancelamentos é dúvida, não decisão).
- **Ainda não move dinheiro.** Evento + auditoria em cada transição.
- **Risco:** baixo/médio. **Testes:** puros (montagem do termo/hash, elegibilidade
  de transição).

### Fatia C — Infra de refund no Mercado Pago (wrapper + ledger)
- `refundPayment(paymentId, valor?)` em `mercadopago.ts`: `POST
  /v1/payments/{id}/refunds` (total ou parcial), com `X-Idempotency-Key`.
- Ledger **`estornos`** espelhando `pagamentos`: um lançamento por refund
  (`acerto_id`, `pagamento_id`, `external_refund_id`, valor BRL e na moeda,
  status), **único** por `(acerto_id, external_refund_id)` (idempotência).
- **Elegibilidade** (helper puro, testável): o acerto pode exigir **N refunds**
  (um por pagamento original); a soma dos estornos tem de bater o
  `saldo_devolver_cliente`. Casos que caem no **fluxo manual** (registrar como
  `executado_manual`): fora da janela do MP, método não estornável, valor não
  casa, pagamento em disputa.
- **Risco:** médio (infra de dinheiro, mas ainda sem "apertar o botão").
  **Testes:** puros (soma/particionamento dos refunds, elegibilidade) + helpers
  de webhook (assinatura, `idempotency_key`), como `mp-events`.

### Fatia D — Execução confirmada por webhook (money out)
- **Transição `aceito → executado` só por confirmação.** A rota de execução
  (`financeiro.gerir`, **sessão, sem Bearer**) dispara o(s) refund(s) da Fatia C,
  mas **não marca `executado`** — grava a intenção e aguarda.
- **Consumidor de webhook de estorno** seguindo o padrão `events`
  (`idempotency_key = mercadopago:refund:<id>`): ao confirmar, grava no ledger
  `estornos`, soma; quando os estornos cobrem o `saldo_devolver_cliente`, marca
  `acertos.status='executado'`. Dedupe, tentativas, reprocessável, **falha
  fechada**.
- **Recibo de devolução** ao cliente (best-effort, `email.ts`).
- **Cron de conciliação** (rede de segurança, como no pagamento): reconsulta
  refunds pendentes e reconcilia estados.
- **Risco:** alto (dinheiro sai). **Guardas:** idempotência ponta a ponta; nunca
  `executado` por tela; não executar sem `aceito`; posse por titular; auditoria.

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

1. **Meio de refund:** estorno via MP (§1.3-A) vs Pix de devolução avulso (B). O
   estorno via MP é idempotente e rastreável, mas tem janela temporal e casa só
   com o pagamento original; o Pix avulso é flexível, porém exige captura da
   chave do cliente e um comprovante próprio.
2. **Refund parcial / múltiplos pagamentos:** confirmar a regra de
   particionamento (um refund por pagamento até cobrir o saldo).
3. **Retenção e política de refund por fornecedor** (jurídico + cadastro).
4. **Texto do Termo/Aditivo de Acerto** (versão + hash).

---

## 7. Sequência recomendada

**A (config de retenção)** → **B (proposta + aceite, sem dinheiro)** → **C
(wrapper de refund + ledger)** → **D (webhook + execução confirmada)** → **E
(aditivo avulso, opcional).**

A ordem coloca todo o valor **sem risco de dinheiro** (A, B) antes de qualquer
peça que mova caixa (C, D), e cada fatia é entregável e testável isoladamente.
As Fatias A–C podem ser construídas já; a Fatia D depende das decisões do §6.

> **Estado:** Fatia A **concluída**. Próxima recomendada: Fatia B (proposta +
> aceite eletrônico, ainda sem dinheiro).
