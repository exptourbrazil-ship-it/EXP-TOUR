# Registro de sessão 2 — Contrato, financeiro, Zoho e UX

Handoff para a próxima sessão. Resume o que foi construído, as decisões tomadas,
o estado das branches (mesclado × aberto), o que foi aplicado no banco e o que
falta. Complementa:
- [`contrato-arquitetura.md`](./contrato-arquitetura.md) — mapa cláusula → arquitetura.
- [`plano-zoho-sign.md`](./plano-zoho-sign.md) — plano do Zoho Sign.
- [`sessao-area-cliente.md`](./sessao-area-cliente.md) — sessão anterior.

Ambiente: o shell do assistente **não tem Node** — build/test rodam no **CI
(GitHub Actions, `.github/workflows/ci.yml`, Node 22)** em cada PR. DDL é aplicado
no Supabase (projeto **Forio**, `lvchpskxeohfmistppxl`) via conector; segredos
(Zoho, etc.) só o usuário configura na Vercel.

---

## 1. O que já está na `main` (mesclado)

- **Dashboard admin** (`/admin`, layout + menu lateral + sessão unificada;
  Financeiro, Documentos com fila de aprovação, Clientes, Sistema/NPS, Câmbio,
  Data de início, Viagem). Fases 0–3 + Clientes.
- **Zoho (passo 1):** download admin de qualquer documento
  (`/api/admin/documentos/[id]/download`), **cópia de documentos no Contato do
  CRM** (`espelharDocumentoNoContatoZoho`, no upload cliente e admin), e **card
  de status** em `/admin/sistema` + autoteste `/api/admin/zoho/status`.
- **Zoho Sign (passos 4–6 + esqueleto do 7):** `sign-events.ts` (puro, com
  `montarSignatarios` por idade e `ehMenorDeIdade`), webhook
  `/api/webhooks/zoho-sign` + `sign-processar.ts`, `zoho-sign.ts`
  (`criarEnvelopeDeTemplate`/`baixarPdfAssinado`), rota
  `/api/admin/contratos/[id]/enviar-assinatura`, tela `/admin/contratos` e
  `sign-template.ts` (config via env). **Repositionado: o Sign é para a Ficha de
  matrícula**, não para o contrato (que é aceite por marcação eletrônica).
- **Aceite do Termo de Adesão:** tabelas `termos`/`aceites`, `/api/aceite`
  (GET/POST), gestão de versões em `/admin/termos`, **banner de aceite** na área
  do cliente, **e-mail de cópia** e **direito de arrependimento (7 dias)**
  (`/api/aceite/arrependimento`, coluna `aceites.arrependido_em`).
- **Financeiro / câmbio:**
  - **Câmbio Anexo II — decisão:** manter a fórmula, mas **IOF não incide sobre o
    spread** (modelo aditivo `PTAX × (1 + spread + iof)`, via `comporCotacaoVet`).
    O texto do contrato já era aditivo, então **não muda o contrato**.
  - **Recibo itemizado por e-mail** a cada pagamento (`itemizarRecibo` +
    `enviarReciboPagamentoEmail`, disparado em `mp-processar-pagamento`).
  - **Extrato de Saldo Devedor** na aba Financeiro: saldo na moeda + R$ do dia
    ("para quitar hoje") + data-limite D-30 (`saldoDevedorMoeda`,
    `dataLimiteQuitacao`).
  - **Parcelas ordenadas por vencimento** (não por número).
- **Antecipação por exigência de visto (Cláusula 7.5):** tabela `antecipacoes`,
  `/api/admin/antecipacoes`, tela `/admin/antecipacoes` e **card de alerta** na
  aba Financeiro.
- **CI** (GitHub Actions) rodando build + testes em cada PR.
- **Doc de análise** contrato × arquitetura (`contrato-arquitetura.md`).

## 2. Branches ABERTAS (aguardando PR/merge)

1. **`claude/regua-quitacao`** — régua de **quitação** D-30/D-15/D-5 (por
   contrato, Cláusula 7.12) **e** ajuste da régua **por parcela** para
   **D-3/D0/D+1/D+5** + mensagem no e-mail ("pode trocar o vencimento sem juros
   ou taxa"). ⚠️ O usuário achou que já tinha mesclado, mas **não está na main**.
2. **`claude/anexo-iii`** — Anexo III (Política de Pagamento dos Fornecedores):
   tabela `anexo_iii_itens`, `/api/admin/anexo-iii`, `/admin/anexo-iii` e seção
   na aba Financeiro do cliente.
3. **`claude/cliente-sidebar-notebook`** — navegação do cliente como **barra
   lateral à esquerda no notebook (lg)**; barra inferior no celular/tablet.

Sem conflito entre si (arquivos/regiões diferentes).

## 3. Decisões-chave (para não reabrir)

- **Pagamento:** manter parcelas flexíveis (cliente remaneja datas/valores). A
  obrigação "dura" é o **Saldo Devedor** na moeda + **quitação até D-30** +
  antecipação por exigência. Sem reescrita do modelo de parcelas.
- **Câmbio:** IOF aditivo (não sobre o spread); alíquota via env
  `IOF_CAMBIO_PERCENTUAL` ("vigente"). Recibo mostra PTAX + 5% + IOF separados.
- **Assinatura do contrato = marcação eletrônica** (nosso aceite). **Zoho Sign =
  Ficha de matrícula** (bilíngue, multi-signatário, campo "processamento
  imediato").
- **Réguas:** por parcela **D-3/D0/D+1/D+5**; por contrato (quitação)
  **D-30/D-15/D-5**. Ambas cessam quando não há o que cobrar.

## 4. Banco (Supabase Forio) — migrações aplicadas

`zoho_sign_fluxo` (documentos.contrato_id, contratos_assinatura,
contratos.estudante_data_nascimento/email, origem 'sistema' no CHECK),
`aceite_termo_adesao`, `aceite_arrependimento`, `lembretes_quitacao`,
`antecipacoes_exigencia`, `anexo_iii_fornecedores`. Bucket **`documentos-contratos`**
(privado) criado. ⚠️ Algumas tabelas (`lembretes_quitacao`, `anexo_iii_itens`) já
existem no banco, mas o **código** que as usa está em **branch aberta** — mesclar
os PRs para o código chegar à produção.

## 5. Pendências (roadmap)

**Sem depender do jurídico:**
- Mesclar as 3 branches abertas.
- **Checkout/proposta (estados 0–1)** — o maior item: proposta com validade de
  10 dias, acesso sem compromisso, sequência assinatura → Entrada (D+5) → ficha.
- **Aceite:** adicionar **identificador de sessão** + **snapshot do Quadro
  Resumo** ao registro, e gerar o **documento integral** baixável (Cláusula 17.3).
- **Trava da remessa da Entrada** durante o arrependimento (2.5.2 / 8.4).
- **UX (passe pendente):** agrupar o menu admin (~12 itens em seções),
  padronizar telas admin antigas (Data de início, Viagem, Câmbio), reorganizar a
  aba Financeiro (hierarquia), home admin com pendências.

**Dependem do jurídico/financeiro (percentuais entre [colchetes] do contrato):**
- **Cancelamento escalonado (Anexo I)** — 1/2/3,5/5% do tuition, teto 800, +
  memória de cálculo na Área do Cliente.
- **Mora (Cláusula 13)** — 2% + 1%/mês + índice; gatilhos 15/30 dias.
- LGPD (consentimento de saúde), uso de imagem, repactuação.

## 6. Configuração pendente (usuário, na Vercel/Zoho)

- **Zoho conectado** (card verde). Para ativar o **Sign**: refresh token com
  escopo `ZohoSign.documents.ALL`, `ZOHO_SIGN_TEMPLATE_ID`,
  `ZOHO_SIGN_ACTION_CONTRATANTE`/`ESTUDANTE`, `ZOHO_SIGN_WEBHOOK_SECRET`, e
  ajustar os nomes dos campos em `sign-template.ts` ao template real; configurar
  o webhook do Sign → `/api/webhooks/zoho-sign?token=<secret>`.
- **Cadastrar a 1ª versão do Termo** em `/admin/termos` (texto do jurídico) para
  o banner de aceite aparecer.
- Manter `IOF_CAMBIO_PERCENTUAL` atualizado quando a alíquota mudar.
