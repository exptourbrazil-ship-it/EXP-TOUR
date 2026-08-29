# Motor Financeiro — Parcelamento flexível e estratégia de câmbio
## Complemento à v3 do Motor da Área do Cliente (Forio / EXP Tour)

Especifica duas coisas: o parcelamento repactuável pelo próprio cliente (valores e datas), condicionado ao `Fornecedor_Prazo_Pagamento`; e a arquitetura de recebimento e câmbio, respondendo à pergunta sobre receber direto na moeda do programa.

---

## 1. O princípio que organiza tudo: a dívida vive na moeda do programa

O saldo devedor do cliente é denominado na moeda do programa (CAD, EUR, USD...), nunca em reais. Cada pagamento em R$ é convertido pela fórmula do dia e **amortiza o saldo em moeda estrangeira**:

```
valor_amortizado = valor_pago_BRL / fator_do_dia
fator_do_dia = cotação_BACEN(data) × (1 + IOF) × (1 + spread)
```

Isso é coerente com a cláusula 6.3 do contrato e tem duas consequências que simplificam todo o resto: o risco cambial das parcelas futuras fica com o cliente (transparente desde o Termo de Adesão), e qualquer repactuação de parcelas é uma redistribuição do **saldo em moeda estrangeira**, imune à variação do real. O portal sempre exibe os dois números: saldo e parcelas na moeda do programa, com o equivalente em R$ do dia marcado como estimativa.

**Nota de consistência**: a v3 usa spread de 6,6% e sua última mensagem menciona 6%. O spread deve ser um **parâmetro por instância** (`Spread_Percentual`), não um número cravado no código nem divergente entre contrato, Termo de Adesão e sistema. Definam o número uma vez, e todos os artefatos leem do mesmo campo.

---

## 2. Os dois marcos que limitam a flexibilidade

O cliente pode mover valores e datas à vontade, **desde que dois marcos sejam respeitados**. São eles que protegem a operação sem burocratizar a experiência:

**Marco 1 — Cobertura da escola.** A soma acumulada dos pagamentos (em moeda do programa) até a data `Fornecedor_Prazo_Pagamento − buffer` deve ser ≥ ao valor a remeter à escola (bruto − comissão). O buffer padrão é de 5 a 7 dias, o tempo de contratar o câmbio e liquidar a remessa (a régua D-45/D-37/D-30 da tesouraria já existe; o marco garante que o caixa esteja lá quando ela rodar). Como o prazo é por fornecedor e por caso, o marco se recalcula sozinho quando a escola exigir pagamento antecipado para emitir a LOA.

**Marco 2 — Quitação total antes do embarque.** Padrão: 100% do saldo quitado até a data de embarque (configurável por instância para `D-X` do embarque). Estudante que viaja devendo é o risco de crédito que este setor aprendeu a não aceitar: a alavanca de cobrança desaparece no momento em que ele embarca. Exceção a isso é decisão humana e documentada, nunca opção do portal.

Visualmente, o editor de parcelas mostra os dois marcos como linhas na régua do tempo, e qualquer redistribuição que os viole é bloqueada na hora, com a explicação: "até 12/03 você precisa ter pago ao menos CAD 8.400, valor que garantimos à escola para a sua vaga". A restrição vira transparência, não atrito.

---

## 3. O motor de repactuação (self-service com guarda-corpos)

### O que o cliente pode fazer sozinho no portal

- Alterar **valor** de parcelas futuras (redistribuindo o saldo entre elas).
- Alterar **data** de parcelas futuras dentro dos marcos.
- Dividir uma parcela em duas ou juntar duas em uma.
- Antecipar pagamentos a qualquer momento (antecipação nunca é bloqueada; amortiza pelo fator do dia, o que na prática é o hedge do próprio cliente contra alta da moeda, e vale dizer isso na interface: "pagando antes, você trava a cotação de hoje para esse valor").

### As regras do editor (validadas server-side, sempre)

| Regra | Padrão sugerido | Racional |
|---|---|---|
| Soma das parcelas = saldo devedor em moeda | invariante | A repactuação redistribui, nunca reduz |
| Marco 1 e Marco 2 | seção 2 | Proteção da vaga e do crédito |
| Valor mínimo por parcela | equivalente a ~R$ 300 | Evita pulverização e custo operacional |
| Parcela editável | apenas futuras, e a próxima só até D-3 do vencimento | PIX do vencimento é gerado com a cotação do dia; mudança em cima da hora quebra a régua de cobrança |
| Repactuações self-service | 2 por trimestre; a partir da 3ª, passa por aprovação humana | Flexibilidade sem virar gestão de fluxo de caixa do cliente pelo portal; repetição frequente é sinal de dificuldade financeira, que merece conversa, não botão |
| Parcela em atraso | bloqueia o editor até regularizar | Repactuar por cima de atraso esconde o problema da régua de cobrança |

### Efeito jurídico sem fricção

Para não exigir aditivo assinado a cada mudança, o contrato-mestre (e o Termo de Adesão) deve prever: "o cronograma de pagamentos poderá ser repactuado pelo CONTRATANTE por meio da Área do Cliente, observados os limites contratuais, valendo como aditivo o registro eletrônico do aceite". Cada repactuação confirmada grava: cronograma anterior, novo cronograma, data/hora/IP e o clique de confirmação. É mais um item para a mesma validação jurídica do Termo de Adesão já prevista na v3.

### O que o motor faz depois de cada repactuação

Regenera a agenda de cobrança (a régua D-7/D-2/D+1... da v3 se realinha às novas datas automaticamente), recalcula o Marco 1 se o caso tiver override de prazo do fornecedor, notifica o cliente com o resumo do novo cronograma e registra o evento para o cockpit. Nenhuma planilha, nenhum e-mail manual.

---

## 4. Recebimento e câmbio: a resposta à sua pergunta

### Mantenha o recebimento em reais. A conversão é problema (e margem) da tesouraria, não do cliente.

Existe, sim, ferramenta para o cliente pagar direto em moeda estrangeira, e a recomendação é **não usar** como modelo principal, por três razões de negócio:

1. **O spread é motor de margem.** Neste setor, a margem de câmbio somada às ancilares frequentemente supera a margem do programa em si. Cliente remetendo direto em CAD elimina essa receita e a entrega ao banco dele.
2. **Fricção mata conversão.** PIX em reais é o pagamento de menor atrito do mundo hoje. Remessa internacional feita pelo cliente pessoa física envolve cadastro em plataforma de câmbio, custo próprio de IOF e spread do banco dele, e prazo de liquidação. Cada parcela viraria um pequeno projeto.
3. **Complexidade regulatória e contábil** de receber receita de serviço no exterior, sem benefício que a compense.

As plataformas que fazem pagamento internacional de educação (Flywire, TransferMate, Convera) resolvem outro problema: o do **estudante pagando a escola diretamente**. No seu modelo, quem paga a escola é a empresa; essas plataformas não têm papel no recebimento do cliente.

### O desenho correto da tesouraria (e é o que você intuiu)

O risco a eliminar é a janela entre receber R$ do cliente e remeter moeda à escola: se o real desvalorizar nesse meio-tempo, a margem encolhe. Duas formas de fechar essa janela, em ordem de preferência:

**Opção A — Conversão contínua para conta multimoeda (recomendada).** A cada parcela recebida (ou em lotes semanais), a tesouraria converte o valor destinado à escola para a moeda do programa e o estaciona numa conta na moeda (o marco legal cambial de 2022/23 simplificou contas em moeda estrangeira para PJ brasileira; operacionalmente, isso se faz via corretora de câmbio parceira com conta de pagamento multimoeda, ou instituições como Wise Business/Airwallex para moedas e valores compatíveis, ou conta no exterior da própria empresa). Resultado: no D-30, a remessa à escola sai de um saldo **já na moeda certa**, com exposição cambial próxima de zero. O cliente pagou o fator do dia; a empresa converteu no mesmo dia; o spread inteiro virou margem realizada, não margem em risco.

**Opção B — Trava de câmbio (forward) com a corretora.** Se manter saldo em moeda for operacionalmente pesado no início, a alternativa é contratar trava para as remessas dos próximos 30 a 60 dias, usando exatamente o relatório de exposição por moeda que o cockpit da v2 do módulo de fornecedores já consolida. Fecha a janela sem conta no exterior, ao custo do prêmio do forward.

O que **não** fazer: acumular R$ em conta corrente e comprar a moeda só no D-30. Isso é especular com a margem do negócio, e um trimestre de real fraco devolve tudo que o spread construiu.

### Encaixe com o parceiro de câmbio

A mesma corretora pode cumprir os dois papéis sem conflito: **B2B** (remessas da empresa às escolas, conta multimoeda ou travas) e **B2C** (o parceiro indicado ao cliente no pré-embarque para a moeda de bolso dele, módulo de parceiros da v3). São contratos separados, e o volume B2B é alavanca para negociar o spread da própria empresa para baixo, o que, com `Spread_Percentual` parametrizado, vira margem adicional sem tocar no preço ao cliente.

---

## 5. Campos, eventos e cockpit

**Campos novos no CRM**: `Saldo_Devedor_Moeda`, `Cronograma_Parcelas` (estrutura: valor em moeda, data, status), `Marco1_Data`, `Marco1_Valor_Moeda`, `Marco2_Data`, `Repactuacoes_Trimestre`, `Spread_Percentual` (parâmetro de instância).

**Eventos novos**: `Repactuacao_Solicitada`, `Repactuacao_Confirmada` (com snapshot antes/depois), `Repactuacao_Bloqueada` (com o marco violado, insumo para melhorar a comunicação), `Antecipacao_Realizada`.

**Cockpit**: além do já previsto, três visões novas: clientes com Marco 1 em risco (acumulado projetado insuficiente a 15 dias do marco, disparando contato humano preventivo antes de virar problema de vaga); volume repactuado no mês (termômetro de saúde financeira da carteira); e a posição de tesouraria por moeda (recebido, convertido, estacionado, remetido), que fecha o ciclo com a aba de contas a pagar do módulo de fornecedores.

---

## 6. Riscos e honestidades

- **Cliente que empurra tudo para o fim.** Os marcos impedem o dano à vaga, mas um cronograma pesado no fim aumenta a inadimplência tardia, a pior de cobrar. O editor deve mostrar o cronograma sugerido (linear) como âncora visual, e o cockpit vigia concentrações anormais.
- **Repactuação como sintoma.** Duas repactuações no trimestre é flexibilidade; quatro é um cliente em dificuldade. O limite com passagem para humano existe para transformar o sinal em conversa de retenção antes do atraso.
- **Variação cambial percebida como "aumento".** Mesmo com transparência, cliente verá a parcela em R$ subir quando a moeda subir. As defesas: a memória de cálculo em cada cobrança, o incentivo explícito à antecipação como trava, e nunca prometer valor fixo em R$ em nenhuma peça de venda.
- **Educação do time de vendas.** O consultor precisa vender o parcelamento como "flexível dentro de dois compromissos" desde a proposta, para a restrição do Marco 1 nunca ser surpresa pós-venda.

---

## 7. Próximos passos

1. `Spread_Percentual` **definido em 5%** no sistema (env `SPREAD_CAMBIO_PERCENTUAL`, default em `src/lib/cambio.ts`), unificado entre contrato (cobrança da parcela) e cotação (câmbio congelado). **Pendência jurídica**: alinhar o mesmo 5% no contrato-mestre, Termo de Adesão e Anexo II (que ainda citam 6,6%).
2. Incluir a cláusula de repactuação eletrônica no pacote da validação jurídica já prevista (Termo de Adesão + contrato).
3. Decidir com a corretora parceira o modelo de tesouraria (conta multimoeda vs. travas) e formalizar o contrato B2B separado do acordo B2C de indicação.
4. Definir os parâmetros do editor (buffer do Marco 1, D-X do Marco 2, mínimo por parcela, limite de repactuações) como configuração por instância.
5. Desenhar o wireframe do editor de parcelas com os dois marcos visíveis na linha do tempo (posso entregar a estrutura de tela na sequência).
