# Minuta — Cláusulas de câmbio do Contrato-Mestre (spread 5%)

> **Natureza deste documento.** Minuta de redação das cláusulas de conversão
> cambial das Condições Gerais e do Anexo II, **atualizadas para a Taxa de
> Intermediação e Câmbio de 5%** (modelo aditivo), consistente com o
> comportamento do sistema. **Não substitui revisão jurídica.** Termos entre
> `[colchetes]` são decisões do jurídico/financeiro. Ver
> [`nota-alteracao-spread-2026-08.md`](./nota-alteracao-spread-2026-08.md).
>
> Numeração alinhada ao mapa em [`contrato-arquitetura.md`](./contrato-arquitetura.md)
> (6.3 Saldo Devedor · 6.4 conversão cambial/Anexo II · 6.5/6.5.2 cobrança e
> recibo · 6.7 simulação não vinculante).

---

## Cláusula 6.3 — Saldo Devedor na moeda de referência

6.3. O preço dos serviços e do programa é **denominado na moeda de referência**
indicada no Quadro Resumo (a "**Moeda de Referência**"), e a obrigação do
CONTRATANTE é expressa e permanece **nessa moeda** até a sua efetiva quitação.

6.3.1. Entende-se por "**Saldo Devedor**" o somatório dos valores, na Moeda de
Referência, ainda não amortizados pelo CONTRATANTE. Cada pagamento **amortiza** o
Saldo Devedor pelo valor, na Moeda de Referência, a ele correspondente.

6.3.2. A conversão para reais (BRL) ocorre **exclusivamente no momento de cada
pagamento**, na forma da Cláusula 6.4, não havendo congelamento antecipado da
taxa nem vinculação a qualquer simulação prévia (Cláusula 6.7).

---

## Cláusula 6.4 — Conversão cambial (Anexo II)

6.4. O valor em reais (BRL) de cada amortização é obtido pela aplicação, ao valor
amortizado na Moeda de Referência, do **Fator de Conversão do dia do pagamento**,
apurado conforme o **Anexo II**, pela fórmula:

> **Valor em BRL = Valor amortizado (Moeda de Referência) × PTAX_venda × (1 +
> Taxa de Intermediação e Câmbio + IOF-câmbio)**

6.4.1. **PTAX de venda.** "PTAX_venda" é a cotação de **venda** da moeda,
divulgada pelo **Banco Central do Brasil**, [Turismo/Comercial], relativa à data
de referência do pagamento (ou, na sua ausência para a data, a **última cotação
divulgada imediatamente anterior**).

6.4.2. **Taxa de Intermediação e Câmbio.** Incide o percentual de **5% (cinco por
cento)**, a título de **Taxa de Intermediação e Câmbio**, correspondente à
**remuneração de serviço** da CONTRATADA pela intermediação e pelo processamento
do pagamento internacional. Esta taxa **não constitui operação de câmbio**, que a
CONTRATADA não realiza.

6.4.3. **IOF-câmbio.** Incide o **IOF-câmbio**, à **alíquota vigente na data** do
pagamento (atualmente **3,5%**), calculado sobre o **valor convertido**
(PTAX_venda × valor amortizado), abrangendo [mensalidade/tuition, taxas e
acomodação, conforme a composição do Quadro Resumo].

6.4.4. **Modelo aditivo.** As alíquotas das Cláusulas 6.4.2 e 6.4.3 **somam-se**
(fator `1 + 5% + IOF`), de modo que o **IOF-câmbio incide sobre o valor
convertido, e não sobre a Taxa de Intermediação e Câmbio**.

6.4.5. **Taxa do dia do pagamento.** A conversão utiliza a cotação e as alíquotas
**vigentes na data de cada pagamento** — a obrigação, denominada na Moeda de
Referência, **flutua** com o câmbio até a quitação. Não há taxa administrativa
fixa adicional por transação.

6.4.6. **Moedas sem cotação PTAX própria.** Para moeda cuja PTAX não seja
divulgada pelo Banco Central [ex.: Dólar Neozelandês — NZD], o câmbio comercial é
apurado por **conversão cruzada** entre a paridade da moeda com o Dólar dos
Estados Unidos (fonte de referência pública [Banco Central Europeu]) e a
PTAX_venda USD/BRL do Banco Central, aplicando-se, sobre o resultado, a mesma
fórmula desta Cláusula.

---

## Cláusula 6.5 — Cobrança via Pix

6.5. Cada amortização é cobrada por **Pix**, com QR Code/código dinâmico, no valor
em reais apurado na forma da Cláusula 6.4 na data da geração da cobrança.

6.5.1. A cobrança Pix é **válida até as 23h59 do dia** de sua geração; expirada,
nova cobrança poderá ser gerada, **recalculando-se** o valor em reais pela cotação
e alíquotas então vigentes (Cláusula 6.4.5).

## Cláusula 6.5.2 — Recibo itemizado

6.5.2. A cada pagamento confirmado, a CONTRATADA disponibiliza ao CONTRATANTE, na
Área do Cliente **e por e-mail**, **recibo itemizado** contendo, no mínimo:

  a) o **valor amortizado na Moeda de Referência**;
  b) a **PTAX de venda** aplicada e a **data** de sua divulgação;
  c) a **Taxa de Intermediação e Câmbio** — percentual (**5%**) e valor em reais;
  d) o **IOF-câmbio** — alíquota vigente (**3,5%**) e valor em reais;
  e) o **total pago em reais**; e
  f) o **Saldo Devedor remanescente na Moeda de Referência**.

6.5.2.1. O recibo **não conterá** linha de tarifa de remessa ou de operação de
câmbio, por não haver, na relação com o CONTRATANTE, cobrança a esse título.

6.5.2.2. Os componentes do recibo são apurados pelos **mesmos percentuais que
compuseram a cotação aplicada na respectiva cobrança**, ainda que os percentuais
vigentes tenham sido alterados posteriormente (Cláusula 6.9).

---

## Cláusula 6.7 — Simulação em reais não vinculante

6.7. Quaisquer valores em reais exibidos **antes do pagamento** (inclusive no
Quadro Resumo e nas telas da Área do Cliente) constituem **simulação meramente
informativa e não vinculante**, calculada pela cotação de um dado momento. A
**obrigação do CONTRATANTE é na Moeda de Referência** e o valor em reais de cada
pagamento é o apurado no **dia do pagamento**, na forma da Cláusula 6.4.

---

## Cláusula 6.9 — Vigência da Taxa de Intermediação e Câmbio

6.9. A **Taxa de Intermediação e Câmbio** é um parâmetro **vigente** informado
pela CONTRATADA, atualmente fixado em **5%**. Eventual alteração:

  a) aplica-se **apenas às cobranças geradas a partir da sua vigência**;
  b) **não afeta** cobranças já geradas nem pagamentos já realizados, cujos
     recibos permanecem apurados pelo percentual então vigente (Cláusula 6.5.2.2);
  c) é comunicada ao CONTRATANTE e registrada por nota de alteração datada.

---

## Anexo II — Metodologia de Apuração Cambial

**II.1. Fórmula.** O valor em reais de cada pagamento é:

```
BRL = valor_na_moeda × PTAX_venda × (1 + 0,05 + IOF)
```

onde `IOF` é a alíquota do IOF-câmbio vigente na data (atualmente `0,035`).

**II.2. Modelo aditivo.** As alíquotas somam-se; o IOF-câmbio incide sobre o valor
convertido (PTAX × valor), não sobre a Taxa de Intermediação e Câmbio.

**II.3. Componentes divulgados no recibo.** PTAX de venda (e data), Taxa de
Intermediação e Câmbio (5% — percentual e valor), IOF-câmbio (alíquota e valor),
total em reais e Saldo Devedor remanescente.

**II.4. Exemplo (PTAX 4,0000; valor amortizado 1.000,00 na Moeda de Referência).**

| Componente | Valor |
|---|---|
| PTAX de venda | 4,0000 |
| Subtotal convertido (PTAX × valor) | R$ 4.000,00 |
| Taxa de Intermediação e Câmbio (5% do subtotal) | R$ 200,00 |
| IOF-câmbio (3,5% do subtotal) | R$ 140,00 |
| **Total em reais** | **R$ 4.340,00** |
| Fator de Conversão equivalente (1 + 0,05 + 0,035) | 1,085 |

**II.5. Moeda sem PTAX própria.** Conversão cruzada conforme a Cláusula 6.4.6.

---

### Checklist para o jurídico/financeiro
- [ ] Confirmar **[Turismo/Comercial]** na PTAX de venda (6.4.1).
- [ ] Confirmar a **base do IOF-câmbio** (6.4.3): valor convertido de
      [tuition + taxas + acomodação].
- [ ] Confirmar a fonte de referência para **NZD** (6.4.6) — [BCE / outra].
- [ ] Substituir a numeração/os `[colchetes]` conforme o contrato-mestre vigente.
- [ ] Anexar a **nota de alteração** (`nota-alteracao-spread-2026-08.md`) ao dossiê.
