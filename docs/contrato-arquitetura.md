# Contrato de Prestação de Serviços × Arquitetura da Área do Cliente

Análise do "CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE ASSESSORIA E INTERMEDIAÇÃO DE
PROGRAMAS EDUCACIONAIS NO EXTERIOR — Termo de Adesão às Condições Gerais" contra
o que a plataforma faz hoje, com os ajustes necessários para **cumprir o
contrato**. Mapa cláusula → estado atual → ajuste. As decisões de negócio/preço
e o texto jurídico são do time comercial/advogado; aqui está o impacto técnico.

## Estrutura do contrato (o que a plataforma precisa produzir)

O contrato tem 4 camadas:
1. **Quadro Resumo** — dados da contratação, **preenchidos automaticamente pela
   plataforma no momento do aceite** (Contratante, Participante, Programa,
   Valores, Regime de pagamento, Assinatura/Entrada).
2. **Condições Gerais** — texto fixo, versionado (Cláusulas 1–18).
3. **Anexo I** (cancelamento/reembolso escalonado), **Anexo II** (metodologia de
   câmbio), **Anexo III** (Política de Pagamento dos Fornecedores, por Programa).

Consequência: o "documento aceito" = **Condições Gerais (versão) + Quadro Resumo
(snapshot dos dados) + Anexos**. A camada de aceite que já construímos cobre a
**versão das Condições Gerais**; falta o **Quadro Resumo** e os Anexos.

---

## Mudanças estruturais de maior impacto

### 1. Pagamento: de parcelas fixas → **Saldo Devedor com amortização livre** (Cláusulas 6.3, 7.3, 7.6)
O contrato **não adota parcelas fixas**. Adota um **Saldo Devedor na moeda de
referência**, que o cliente amortiza **livremente** (quando/quanto quiser),
com dois marcos: **quitação até D‑30** do início (Cláusula 7.4) e **antecipações
pontuais por exigência de visto/fornecedor** (Cláusula 7.5).
- **Hoje:** modelo de `parcelas` (numero, vencimento, valor fixo).
- **Ajuste:** introduzir o conceito de **Saldo Devedor** (moeda de referência)
  + **pagamentos livres** que amortizam; manter D‑30 como data‑limite e a
  antecipação como exceção documentada. As "parcelas" viram, no máximo, sugestão
  de plano — a obrigação é o saldo. **Maior mudança de modelo de dados e de UI.**

### 2. Câmbio: fórmula do **Anexo II** (Cláusula 6.4)
Contrato: `Valor R$ = valor_moeda × PTAX_venda × (1 + 5%) + IOF‑câmbio`, com
**IOF aditivo** (alíquota **vigente na data**, sobre o valor convertido/remetido)
e **5%** = Taxa de Intermediação e Câmbio.

> **Spread reduzido de 6,6% → 5% e modelo aditivo IMPLEMENTADOS** (ver
> [`nota-alteracao-spread-2026-08.md`](./nota-alteracao-spread-2026-08.md)):
> `cotacao_vet = PTAX × (1 + 0,05 + 0,035)` (aditivo). Cobranças anteriores à
> vigência permanecem a 6,6% (spread congelado por parcela). O trecho
> "Hoje/Ajuste" abaixo descreve a migração já concluída.

- **Antes:** `cotacao_vet = PTAX × (1+0,066) × (1+0,035)` — spread 6,6% e IOF
  **embutido** como multiplicador fixo de 3,5% num VET único e opaco.
- **Ajuste:** (a) **IOF aditivo e configurável** (alíquota vigente, não fixa em
  3,5%); (b) **armazenar os componentes separados** (PTAX + data de divulgação,
  5%, IOF) em vez de um VET único, porque o **recibo** e o Anexo II exigem
  itemização; (c) base do IOF = valor convertido (tuition+taxas+acomodação).
- **Confirmar com o financeiro/jurídico** a base exata do IOF e a alíquota vigente.

### 3. Assinatura do contrato = **marcação eletrônica** (Cláusula 17.1) — é o nosso ACEITE
O contrato define sua própria assinatura como **aceite por marcação eletrônica**
com registro de **data, hora, IP, versão do documento e identificador de sessão**.
- **Hoje:** camada de aceite registra data/hora/IP/versão/hash/user‑agent.
- **Ajuste:** (a) adicionar **identificador de sessão** ao registro de aceite;
  (b) vincular o aceite **também ao Quadro Resumo** (snapshot), não só à versão
  das Condições Gerais; (c) `/admin/termos` deve versionar as **Condições Gerais**.

### 4. **Zoho Sign** encaixa melhor na **Ficha de matrícula** (Cláusulas 2.5e, 8.4)
A **Ficha de matrícula bilíngue** é assinada **depois** da Entrada, precisa de
assinatura por participante/responsável (**multi‑signatário por idade**) e contém
o campo **"processamento imediato"** (não pré‑marcado, nas duas línguas). Esse é
o documento que o **Zoho Sign** deve produzir — não o contrato em si (que é
marcação eletrônica). O que construímos no Sign se **reposiciona** para a Ficha.

### 5. **Checkout/proposta (estados 0–1) não existe** (Cláusula 2.5)
A sequência exigida é: **Proposta (validade 10 dias)** → **Acesso à Área do
Cliente sem compromisso** (ver dados/valores/Anexo III, **sem pagamento e sem
reservar vaga/preço**) → **Assinatura** → **Entrada (D+5)** → **Ficha de
matrícula**. Hoje o titular é criado direto pelo admin; **falta todo o topo do
funil**. É pré‑requisito para a cronologia que dá segurança jurídica (notas do
próprio contrato, art. 46/49 CDC).

---

## Mapa detalhado (cláusula → estado → ajuste)

| Cláusula | Exige | Hoje | Ajuste |
|---|---|---|---|
| 2.5 sequência | Proposta→acesso→assinatura→entrada→ficha | titular criado pelo admin | **Novo fluxo de proposta/checkout** + estado "pré‑contratação" (sem parecer matrícula confirmada, 2.5b) |
| 2.5.2 / 8.4 / nota | **Não remeter a Entrada** ao fornecedor durante os 7 dias, salvo "processamento imediato" | não há remessa nem trava | **Trava de remessa da Entrada** enquanto arrependimento correndo e campo não marcado |
| 6.5 / 6.5.2 recibo | Cobrança PIX exibe PTAX, 5%, IOF, R$ e amortização; **recibo** itemizado + e‑mail; **sem** linha de tarifa/remessa | `pagamentos` guarda valor_brl/cotação; sem itemização | **Recibo enriquecido** (PTAX+data, 5% %/valor, IOF, amortização, saldo) na Área do Cliente **e por e‑mail** |
| 6.5 validade | Cobrança PIX vale até **23h59 do dia** | idempotência por valor | Marcar validade/expiração diária da cobrança |
| 6.8 / 7.12 | **Extrato de Saldo Devedor** sempre visível (moeda + R$ do dia); histórico com cotação; valor de quitação; avisos **D‑30/D‑15/D‑5** | régua D‑7/D‑2/D+1/D+5 | Tela de **Saldo Devedor**; ajustar janelas da régua p/ D‑30/D‑15/D‑5 |
| 6.7 / 6.2.1 / nota 335 | **Simulação em R$ não vinculante**, destacada; obrigação é em moeda | UI mostra estimativa BRL | Rotular como **"simulação informativa, não vinculante"** com destaque; nunca como preço |
| 7.2 Entrada | application fee + placement fee, moeda, D+5, amortiza saldo | — | Modelar **Entrada** como 1º evento do Saldo Devedor + prazo D+5 |
| 7.5 antecipação | Exibir doc, valor+composição, data‑limite do 3º, **comprovante da exigência** | "antecipar" é ação de parcela | **Antecipação por exigência** com lastro documental exibido |
| 7.11 repactuação | Solicitar pela Área do Cliente; aceite EXP; termo próprio | — | Fluxo de **repactuação** (solicitação + termo) |
| 8 arrependimento | 7 dias da **assinatura**; botão + e‑mail + canal; restituição 10 dias, PIX à origem | **feito** (botão + registro + aviso) | Prazo já conta do aceite. Falta: **restituição** operacional e o caso "arrependimento antes de pagar a Entrada" (nota 337) |
| 9 / Anexo I cancelamento | Retenção **escalonada por etapa** (1/2/3,5/5% do tuition, teto 800) + não recuperáveis + câmbio/IOF; **memória de cálculo** na Área do Cliente; dispensas (I.4) | — | Rastrear **etapa concluída** por contrato; **calculadora de reembolso** com memória de cálculo |
| 13 mora | Após D‑30: multa 2% + juros 1%/mês + índice; 15d suspende, 30d resolve; ≥2 avisos amigáveis | régua básica | Encargos de mora sobre o saldo; gatilhos 15/30 dias; ≥2 comunicações |
| 17.3 / Dec. 7.962 | **Via integral** do Contrato+Quadro Resumo+Anexos, com download/impressão, acesso permanente | — | Gerar/guardar o **documento integral** baixável (cofre) |
| Anexo III | Política de Pagamento dos Fornecedores **antes** da contratação; integra o contrato | — | Novo documento por Programa, disponível **pré‑assinatura** |
| 15 LGPD | Consentimento **específico** p/ dados sensíveis (saúde); compartilhamento c/ fornecedores/transferência internacional; Política de Privacidade por referência | dados sensíveis no cofre | Consentimento destacado de saúde; base legal do compartilhamento |
| 16 imagem | Opt‑in **separado**, facultativo, revogável | — | Consentimento de imagem à parte (não condiciona a contratação) |
| Quadro Resumo | ~30 campos (RG, nascimento, endereço, passaporte, participante, instituição, curso, término, acomodação, seguro, saldo, modalidade cambial…) | `contratos` tem poucos campos | **Ampliar o modelo** de contrato/titular para o Quadro Resumo |

---

## Roadmap sugerido (por dependência e valor)

**Bloco A — Fundamentos financeiros (base para cumprir o núcleo do contrato)**
1. **Câmbio Anexo II:** reescrever a apuração (PTAX venda + 5% + IOF aditivo/
   configurável) e **guardar componentes separados**. Recibo itemizado.
2. **Saldo Devedor:** modelar saldo em moeda de referência + pagamentos livres
   que amortizam; extrato (moeda + R$ do dia) na Área do Cliente.
3. **Recibo enriquecido** (Área do Cliente + e‑mail) conforme 6.5.2.

**Bloco B — Contratação (cronologia da Cláusula 2.5)**
4. **Proposta/checkout** (estados 0–1) com validade de 10 dias e acesso prévio
   sem compromisso.
5. **Aceite = assinatura**: adicionar **Quadro Resumo** (snapshot) + **session
   id** ao aceite; gerar o **documento integral** baixável (17.3).
6. **Trava da remessa da Entrada** durante o arrependimento (2.5.2 / 8.4).

**Bloco C — Matrícula e pós‑contratação**
7. **Ficha de matrícula (Zoho Sign)** bilíngue, multi‑signatário, campo
   "processamento imediato" (reposiciona o passo 7 do Sign).
8. **Anexo III** (Política de Pagamento dos Fornecedores) pré‑contratação.
9. **Cancelamento/reembolso** escalonado (Anexo I) com etapa + memória de cálculo.
10. **Mora** (Cláusula 13) e **régua** ajustada a D‑30/D‑15/D‑5.

**Bloco D — Conformidade**
11. LGPD (consentimento de saúde), uso de imagem, repactuação.

---

## Pontos para o jurídico/financeiro confirmar
- **Base e alíquota do IOF‑câmbio** (aditivo, "vigente na data") e a base exata
  (valor convertido de tuition+taxas+acomodação).
- **Simulação em R$** no Quadro Resumo (manter como informativa — nota 335).
- **Ficha de matrícula** bilíngue e o texto do campo "processamento imediato"
  (não pré‑marcado, não pode ser condição para prosseguir — nota 339).
- **Percentuais/limites** entre colchetes no contrato (Entrada D+5, retenções
  1/2/3,5/5%, teto 800, prazos 10/15/30 dias, índice IPCA/IGP‑M).
- Se a **assinatura do contrato** fica como marcação eletrônica (nosso aceite) ou
  também vai para o Zoho Sign — o texto do contrato aponta para marcação (17.1).
