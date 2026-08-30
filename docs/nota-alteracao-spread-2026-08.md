# Nota de Alteração — Taxa de Intermediação e Câmbio (spread): 6,6% → 5%

| | |
|---|---|
| **Nota nº** | NA-CAMBIO-2026-08 |
| **Data de emissão** | 30/08/2026 |
| **Parâmetro** | `Spread_Percentual` (Taxa de Intermediação e Câmbio) |
| **Valor anterior** | **6,6%** |
| **Valor novo** | **5,0%** |
| **IOF-câmbio** | **3,5%** (inalterado) |
| **Vigência no sistema** | a partir do deploy do PR #110 (câmbio unificado da cotação à regra do contrato) |
| **Aplica-se a** | cobranças **geradas a partir da vigência**; o que já foi gerado/pago **permanece a 6,6%** (ver §3) |

---

## 1. Objeto

Fica **reduzida de 6,6% para 5,0%** a **Taxa de Intermediação e Câmbio** (o "spread") aplicada na conversão do valor do programa (em moeda estrangeira) para reais, na cobrança das parcelas via Pix e no câmbio congelado da cotação.

Esta é a remuneração de serviço da EXP Tour embutida na conversão — **não** é operação de câmbio (que a empresa não realiza). O IOF-câmbio de 3,5% **não muda**.

## 2. Fórmula vigente (modelo aditivo)

```
Valor R$ = valor_moeda × PTAX_venda_BACEN × (1 + 5,0% + 3,5%)
         = valor_moeda × PTAX_venda_BACEN × 1,085
```

- **Aditivo** (as alíquotas somam, não multiplicam): o **IOF-câmbio incide sobre o valor convertido** (PTAX × valor), **não sobre o spread** — cobrar IOF sobre a remuneração de serviço tributaria o que não é câmbio. Por isso `(1 + spread + IOF)` e não `(1+spread)×(1+IOF)`.
- **PTAX de venda** do Banco Central (Turismo/Comercial de Venda). Para o NZD (sem PTAX diária), aproxima-se por conversão cruzada NZD/USD (referência do BCE) × USD/BRL do BACEN.
- Fonte cambial **atualizada diariamente** (job automático), com validade da cotação congelada = **min(10 dias, último dia do mês)**.

### Exemplo numérico (PTAX 4,00; valor do programa 1.000 na moeda)

| Item | Antes (6,6%) | Depois (5,0%) |
|---|---|---|
| PTAX de venda | 4,0000 | 4,0000 |
| Fator (1 + spread + IOF) | 1,101 | 1,085 |
| VET (cotação aplicada) | 4,4040 | 4,3400 |
| **Total em R$** | **R$ 4.404,00** | **R$ 4.340,00** |
| Taxa de Intermediação (spread) | R$ 264,00 (6,6% de 4.000) | R$ 200,00 (5,0% de 4.000) |
| IOF-câmbio (3,5% de 4.000) | R$ 140,00 | R$ 140,00 |

Redução de **1,6 ponto percentual** no spread → **≈ 1,45% a menos** no valor convertido total.

## 3. Vigência e efeito sobre o que já existe

**"O que já foi pago/cobrado permanece como está."**

- Cobranças (Pix) **geradas a partir da vigência** usam **5,0%**.
- Cobranças **geradas antes** da vigência — e todos os pagamentos já realizados — **permanecem a 6,6%**. O sistema **congela o spread aplicado na parcela** no momento da geração da cobrança, e o **recibo decompõe (PTAX / taxa / IOF) sempre pelo percentual congelado**, não pelo vigente. Recibos históricos e reemissões saem idênticos aos originais.
- Não há reprocessamento retroativo de parcelas nem de contratos já provisionados.

## 4. Situação no sistema (já implementado)

O parâmetro é **por instância (TENANT), lido de configuração** — nunca cravado em regra de negócio:

- `SPREAD_CAMBIO_PERCENTUAL` (env) = **0.05**; `IOF_CAMBIO_PERCENTUAL` = **0.035**. Default de código em `src/lib/cambio.ts` (`SPREAD_PADRAO = 0.05`, `IOF_PADRAO = 0.035`).
- `SPREAD_LEGADO = 0.066` — usado **apenas** como fallback de decomposição de recibos de cobranças anteriores à gravação do spread por parcela (preserva o histórico).
- Composição da cotação VET (cron de câmbio e câmbio manual), cobrança da parcela, recibo (Área do Cliente e e-mail) e **câmbio congelado da cotação** — todos leem o mesmo parâmetro. Sem divergência entre contrato e cotação.

## 5. Reconciliação necessária (documentos jurídicos e artefatos)

Os documentos abaixo ainda citam **6,6%** e precisam ser atualizados para **5,0%** (ou passar a referenciar `Spread_Percentual`), pela mesma pessoa/área jurídica, **na mesma data de vigência**, para que contrato, Termo e sistema leiam o mesmo número:

**Documentos jurídicos (fora do repositório — anexar esta nota):**
- **Contrato-mestre — Cláusula 6.4 (Anexo II, metodologia de câmbio):** a fórmula da apuração cambial (PTAX venda + spread + IOF, modelo aditivo).
- **Contrato-mestre — Cláusula 6.5 / 6.5.2 (recibo):** o recibo itemizado exibe PTAX, a **Taxa de Intermediação e Câmbio** (agora **5,0%**) e o IOF.
- **Anexo I (memória de cálculo exemplo):** atualizar o exemplo (valor na moeda, cotação, IOF, taxa de serviço).
- **Termo de Adesão:** onde referencia a taxa de serviço/spread na conversão.

**Artefatos internos (neste repositório — atualizados junto desta nota):**
- `docs/contrato-arquitetura.md` (fórmula da Cláusula 6.4 e mapa de cláusulas 6.5.2).
- `docs/01-arquitetura-mestre-v4.md`, `docs/03-motor-area-do-cliente-v3.md`, `docs/00-LEIA-PRIMEIRO.md`, `docs/sessao-area-cliente-2.md` (menções operativas ao parâmetro).
- `CLAUDE.md` e `docs/04-motor-financeiro-parcelamento.md` já referenciam 5%.

**Ponto fiscal em aberto (levar ao contador):** a Taxa de Intermediação e Câmbio deve ser destacada como **taxa de intermediação/serviço** na nota e no contrato — inequivocamente **receita de serviço**, não operação de câmbio. Ver `docs/10-briefing-contador-tributarista.md` (mantido no valor histórico de 6,6% por ser briefing de data anterior; ao reemitir, usar 5,0%).

## 6. Como alterar no futuro

O spread é um **parâmetro único de configuração por instância**. Para mudar de novo:

1. Ajustar `SPREAD_CAMBIO_PERCENTUAL` (env) da instância — o default de código (`src/lib/cambio.ts`) é apenas o fallback.
2. Emitir **nova nota de alteração** (como esta), com nova data de vigência.
3. Atualizar o valor de `SPREAD_LEGADO` **não é necessário** — ele é uma constante histórica; cada cobrança nova já grava o spread aplicado na própria parcela.
4. Reconciliar contrato-mestre / Termo / Anexo na mesma data.

## 7. Aprovações

| Papel | Nome | Data | Assinatura |
|---|---|---|---|
| Responsável comercial | | | |
| Jurídico | | | |
| Contábil/Fiscal | | | |
