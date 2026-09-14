# Especificação de sistema: Anexo III, datas e cálculo de reembolso

Requisitos de dados e de cálculo para que o Anexo III, o Quadro Resumo, o simulador, o checkout, a Área do Cliente e o Altus digam sempre a mesma coisa.

Decorre do Contrato v3.1 e das decisões registradas em `forio-redlines-conciliacao.md`. Documento de arquitetura, não de implementação.

---

## 1. Dois princípios que governam tudo

**Fonte única.** Toda data, alíquota e valor que aparece em mais de uma superfície vem de um campo, nunca de duas fórmulas. Divergência entre simulador e checkout é a reclamação com maior taxa de perda, porque o cliente tem prova em tela dos dois.

**Data calculada uma vez, na proposta.** As datas nascem quando a proposta é gerada, a partir da data de início escolhida, e ficam **gravadas** no registro daquele cliente. Nunca recalculadas em tempo de leitura. Isso é o que permite ao Altus e ao atendimento lerem a data do cliente em vez de derivá-la, e é o que sustenta a exigibilidade da data-limite pelo artigo 397 do Código Civil, que requer termo certo.

---

## 2. O ponto difícil: retenção é escada, não fronteira

O erro natural de modelagem aqui é tratar a retenção da escola como uma data de corte com um antes e um depois. **Não é.** Quatro dimensões variam por escola.

### 2.1. A âncora da contagem varia

| Âncora | Escolas |
|---|---|
| Data de início do programa | LSI, Anglo-Continental, Babel, BELS, ETC, The London School, Twin, NESE, Rennert, UCSD |
| Data de assinatura do contrato | VanWest, 7 dias. LSI Toronto e Vancouver, 7 dias |
| Data da reserva | OISE e Regent, 14 dias |

Uma escola pode ter **duas âncoras ao mesmo tempo**: a VanWest conta 7 dias da assinatura para a faixa de reembolso integral e passa a contar horas cumpridas depois do início.

### 2.2. A unidade varia

Dias corridos, dias úteis, semanas, e percentual de horas cumpridas. O caso de dias úteis exige calendário de feriados do país da escola, não do Brasil.

### 2.3. O número de degraus varia

Não é um corte, são vários. Exemplos do portfólio ativo:

| Escola | Degraus |
|---|---|
| The London School | 4: acima de 21 dias, 15 a 21, 10 a 14, abaixo de 10 |
| BELS | 4: 22 ou mais, 21, 20 a 8, 7 ou menos |
| VanWest, pós-início | 4: até 10% das horas, 10 a 30%, 30 a 50%, acima de 50% |
| LSI, por país e estado | até 8 conjuntos distintos |
| Anglo-Continental | 2 |
| Rennert, pós-início | 3 |

### 2.4. A expressão da retenção varia

| Tipo | Exemplo |
|---|---|
| Valor fixo | £500 na Anglo, €55 na BELS |
| Percentual do curso | 25%, 50% ou 100% na BELS |
| N semanas de curso | 2 semanas na LSI, mínimo de 2 na ETC, 1 a 3 na The London School |
| Percentual com teto | VanWest, 10% do curso com teto de CAD 1.000 |
| Percentual de horas cumpridas | VanWest e LSI, pós-início |
| Combinação | 1 semana de curso, acomodação e atividades, mais taxas |
| Mínimo cobrado | Anglo, sempre no mínimo 8 semanas de curso |

E em todos os casos as taxas não reembolsáveis são deduzidas por cima, sempre.

### 2.5. Modelo mínimo que suporta isso

```
PoliticaRetencao
  escola_campus_id
  programa_tipo            (opcional, quando a regra varia por tipo)
  duracao_min_semanas      (opcional, quando varia por duração)
  duracao_max_semanas      (opcional)
  degraus[]
    ancora                 inicio | assinatura | reserva | horas_cumpridas
    unidade                dias_corridos | dias_uteis | semanas | percentual_horas
    limite_de              (nulo = sem limite inferior)
    limite_ate
    retencao_tipo          valor_fixo | pct_curso | pct_programa | n_semanas_curso
                           | n_semanas_tudo | pct_horas
    retencao_valor
    retencao_teto          (opcional, com moeda)
    minimo_cobrado         (opcional, ex. 8 semanas de curso)
  taxas_nao_reembolsaveis[] (sempre somadas)
  fonte, versao, data_levantamento
```

Um programa pode ter mais de uma PoliticaRetencao aplicável, uma da escola e uma do provedor de acomodação, com degraus diferentes. As duas precisam ser resolvidas e apresentadas separadamente.

---

## 3. Entidades e campos

### 3.1. EscolaCampus

**A chave é o campus, não a escola.** A LSI tem regra distinta para Reino Unido e bloco europeu, Estados Unidos em geral, Califórnia, Massachusetts, Nova York, Toronto, Vancouver e Nova Zelândia. Modelar por escola gera anexo errado, e anexo errado é pior que anexo faltando, porque vincula conteúdo incorreto pelo artigo 46 do CDC.

```
EscolaCampus
  escola, cidade, pais, estado_provincia
  moeda
  calendario_feriados      (para as regras em dias úteis)
  intake_maximo_vendavel   data até a qual há preço confirmado
  prazo_pagamento          ancora + unidade + valor
  reembolso_destinatario   agencia | aluno
  reembolso_prazo_dias     processamento pela escola
  reembolso_forma          dinheiro | credito
  credito_validade_meses   (quando forma = credito)
  credito_transferivel     bool
  credito_escopo           (onde pode ser usado)
  politica_fonte           contrato_representacao | site
  politica_url, politica_snapshot_ref, politica_versao, politica_data
  protecao_estudantil      conta_fiduciaria | fundo | garantia | nenhum
```

`intake_maximo_vendavel` é o que impede vender além do horizonte de preço confirmado. Proposta para início posterior a essa data deve ser bloqueada, não desaconselhada.

`politica_fonte = site` marca as escolas que hoje são gatilho latente da Cláusula 7.5.4. Deve alimentar a rotina de monitoramento e snapshot.

### 3.2. TaxaObrigatoria

Compõe a Entrada. Uma linha por taxa, por campus.

```
TaxaObrigatoria
  escola_campus_id
  nome                     (matrícula, registro, depósito de reserva,
                            placement de acomodação, materiais,
                            manutenção de residência, courier)
  valor, moeda
  condicao_aplicacao       sempre | com_acomodacao | com_residencia
                           | duracao_min | destino_especifico
  reembolsavel             bool
  vencimento               assinatura + N dias
  componente               educacional | terceiro
```

`componente` é o campo que separa o **Componente Educacional** do resto. Ver a seção 3.4.

A definição de Entrada no contrato passou a ser aberta, "todas as taxas obrigatórias". O sistema é que fecha a lista, por campus. Se uma taxa não estiver cadastrada, ela não entra na Entrada e não é oponível ao cliente.

### 3.3-A. Componente Educacional

O Contrato v3.1 criou, na alínea g.1 da Cláusula 1.1, uma segunda base de cálculo. **O Custo do Programa continua sendo o total. O Componente Educacional é a parte sobre a qual incide a Remuneração por Serviços Prestados.**

```
ItemDoPrograma
  programa_id
  fornecedor_id
  descricao
  valor, moeda
  componente               educacional | terceiro
```

| componente | O que entra |
|---|---|
| `educacional` | curso, taxas da Instituição de Ensino, acomodação intermediada por ela ou por provedor por ela indicado |
| `terceiro` | passagem aérea, seguro, e demais serviços de terceiros contratados pela Forio a pedido do Contratante |

```
Custo do Programa       = soma de todos os itens
Componente Educacional  = soma dos itens com componente = educacional
```

**O serviço de assessoria migratória não entra em nenhum dos dois.** Pela Cláusula 10.2 ele é contratado diretamente entre o Contratante e o parceiro, e não integra o Programa. Não deve ser cadastrado como ItemDoPrograma.

**Consequência para a calculadora:** a Remuneração por Serviços Prestados incide sobre o Componente Educacional, nunca sobre o Custo do Programa. Um programa com passagem e seguro contratados terá duas bases distintas, e a memória de cálculo precisa mostrar as duas para o cliente entender por que o percentual não bate com o total que ele pagou.

### 3.3. ExigenciaAntecipacao

Alimenta o campo do item 7 do Quadro Resumo que ativa a Cláusula 7.5. Com o campo vazio, a cláusula fica dormente.

```
ExigenciaAntecipacao
  escola_campus_id
  ativa                    bool
  evento_gerador           emissao_documento_visto | confirmacao_reserva
                           | manutencao_reserva
  documento_viabilizado
  valor ou percentual, moeda
  data_limite              ancora + unidade + valor
  comprovante_ref          upload obrigatório
  condicao                 (ex. programas acima de 12 semanas, Nova Zelândia)
```

`comprovante_ref` obrigatório: a Cláusula 7.5.1 veda exigir antecipação sem lastro documental.

---

## 4. Campos calculados na proposta e gravados

Calculados uma vez, a partir da data de início escolhida, e persistidos no registro do cliente.

**Duas datas de início, e só uma é canônica.** Pela alínea "b" da Cláusula 1.1, **a data de início do Programa, para todos os efeitos contratuais, é a data de início do curso**, ainda que a acomodação comece antes. As duas são cadastradas, e todos os prazos derivam da primeira.

```
Programa
  data_inicio_curso        canônica, base de todos os prazos
  data_inicio_acomodacao   informativa, exibida no Quadro Resumo quando distinta
```

| Campo | Cálculo | Onde aparece |
|---|---|---|
| `proposta_validade_dias` | indicada na proposta, **padrão 5** | Quadro Resumo, expiração do link |
| `entrada_valor` | soma das TaxaObrigatoria aplicáveis | Resumo, seção 1, Quadro Resumo |
| `entrada_vencimento` | data de assinatura + 5 dias corridos | Resumo, seção 2 |
| `quitacao_data_limite` | menor entre (`data_inicio_curso` menos 30 dias) e prazo do fornecedor, quando registrado | Resumo, seção 2, Quadro Resumo, simulador, Altus |
| `janela_amortizacao_meses` | meses entre assinatura e `quitacao_data_limite` | simulador |
| `antecipacao_*` | valor, data e documento, quando `ExigenciaAntecipacao.ativa` | seção 2, Quadro Resumo item 7 |
| `retencao_datas[]` | **uma data por degrau**, por fornecedor | Resumo, seções 3 e 4 |
| `reembolso_prazo_total` | processamento da escola + repatriação + repasse Forio | seção 5 |

### 4.1. Sobre `retencao_datas[]`

O resumo no topo mostra **uma** data, a do primeiro degrau, que é a que importa na decisão. As seções 3 e 4 desdobram os demais. Em escola com quatro degraus, como a The London School, o corpo do anexo traz quatro faixas com datas, e o resumo traz a primeira.

### 4.2. Sobre `reembolso_prazo_total`

Três parcelas, todas visíveis no anexo:

```
reembolso_prazo_total =
    EscolaCampus.reembolso_prazo_dias
  + parametro_global.repatriacao_dias_medios
  + 15                                   (Cláusula 9.4)
```

`repatriacao_dias_medios` é parâmetro global editável, não constante em código. Começa por estimativa e passa a ser alimentado por realizado.

---

## 5. Calculadora de reembolso

Precisa de cinco entradas e produz a memória de cálculo exigida pela Cláusula 9.3.

**Entradas:** histórico de pagamentos, estado do processo, data de início, `PoliticaRetencao` dos fornecedores, data do pedido.

**Histórico de pagamentos**, por pagamento: valor em reais, PTAX aplicada e sua data, taxa de 5% em valor, IOF em valor e alíquota, valor amortizado na moeda. Todos necessários, porque o item I.1.3 do Anexo I deduz o IOF e os 5% já incidentes, que não são estornáveis.

**Estado do processo**, máquina de estados que define o degrau da Remuneração por Serviços Prestados:

| Estado | Degrau |
|---|---|
| matrícula ainda não submetida ao Fornecedor | **0%**, salvo atraso imputável ao Contratante, quando aplica 2,0% |
| matrícula submetida e processada | 2,0% |
| carta de aceitação emitida | 3,5% |
| visto instruído | 5,0% |

Com uma sobreposição: **programa a menos de 30 dias do início força o degrau de 5%**, independentemente do estado. O degrau final é o maior entre o derivado do estado e o derivado da data.

Base de cálculo: **Componente Educacional**, apurado na forma da seção 3.3-A. Teto absoluto de 800 unidades da Moeda de Referência, em qualquer degrau e em qualquer data. Teto absoluto de 800 unidades da Moeda de Referência, em qualquer degrau e em qualquer data.

**Saída:** memória de cálculo discriminando retenção por fornecedor, Remuneração por Serviços Prestados com o degrau e o estado que o gerou, IOF e taxa já incidentes, valor a restituir ou **saldo devido pelo cliente** quando a retenção superar o pago, na forma do item I.1.1.

O caso do saldo devido não é exceção teórica. Cliente que pagou apenas a Entrada e cancela a 20 dias do início cai nele com frequência.

---

## 6. Geração e versionamento do Anexo III

```
AnexoIII_Emitido
  cliente_id, programa_id
  conteudo_snapshot        documento gerado, imutável
  versao, hash
  emitido_em
  politicas_referenciadas[] escola_campus_id + politica_versao
  entregue_em, comprovante_entrega
  ciencia_assinada_em, envelope_ref
```

O snapshot é imutável. O que vale para aquele cliente é o anexo emitido, não a política vigente na escola hoje. Isso é o que sustenta a Cláusula 18.2 e é a defesa quando a escola alterar a política depois.

`politicas_referenciadas` permite responder, meses depois, qual versão da política de qual campus foi entregue àquele cliente.

---

## 7. Bloqueios obrigatórios

Regras que impedem gravação ou avanço de etapa, não avisos.

| Bloqueio | Razão |
|---|---|
| Proposta com início posterior a `intake_maximo_vendavel` | Vender além do horizonte de preço confirmado transfere o risco de reajuste para a Forio, sem cláusula que a proteja |
| Envelope 1 sem Anexo III completo daquele campus | Sem Anexo III, o artigo 46 do CDC afasta a vinculação, e caem retenção, antecipação e prazo de reembolso de uma vez |
| Anexo III com campo obrigatório vazio | Os quatro campos novos de cancelamento e reembolso entram na validação |
| Anexo III de campus diferente do programa | Anexo errado vincula conteúdo errado |
| `ExigenciaAntecipacao.ativa` sem `comprovante_ref` | Cláusula 7.5.1 |
| Remessa ao fornecedor antes de `EscolaCampus.prazo_pagamento` | Decisão desta rodada. Exceção com aprovação registrada |
| Remessa da Entrada durante o prazo de arrependimento, sem processamento imediato marcado | Cláusula 2.5.2 |
| `quitacao_data_limite` nulo ou derivado por fórmula em tempo de leitura | Cláusula 7.4, termo certo |
| Item do Programa cadastrado sem `componente` definido | Cl. 1.1.g.1, base da Remuneração |
| Remuneração calculada sobre o Custo do Programa em vez do Componente Educacional | Item I.2.8 |
| Prazo derivado de `data_inicio_acomodacao` | Cl. 1.1.b |
| Amortização registrada sem conciliação automática | Cl. 6.5.3 |
| Proposta acessível após `proposta_validade_dias` | Cl. 2.5.a |

---

## 8. Variáveis de fonte única

| Variável | Fonte | Nunca |
|---|---|---|
| PTAX de venda | job diário do Banco Central, boletim de fechamento | escrita em texto |
| Cotação por cruzamento via Euro | BCE mais PTAX do Euro, quando o BACEN não cota a moeda | calculada ad hoc |
| Alíquota de IOF | tabela com vigência por data | constante em código ou em texto |
| Taxa de Intermediação e Câmbio | constante de configuração | negociada por cliente |
| `quitacao_data_limite` | campo do registro do cliente | fórmula em tempo de leitura |
| `repatriacao_dias_medios` | parâmetro global editável | constante |
| Teto de 800 | constante de configuração, na Moeda de Referência | convertido e travado em reais |
| `proposta_validade_dias` | campo por proposta, padrão 5 | constante em código |
| Canais Oficiais da contratação | campo do Quadro Resumo | presumidos |

---

## 9. Superfícies que consomem, e a regra entre elas

Simulador do site, checkout, Área do Cliente, Anexo III, Quadro Resumo e Altus.

**Todas leem as mesmas funções e os mesmos campos.** Em particular, o Altus não calcula plano de pagamento, equivalência em reais nem data-limite. Ele lê ou chama a mesma função do simulador. Ele é a terceira superfície onde o número aparece e a única onde o cliente pede simulação em linguagem natural, então cálculo próprio ali gera três resultados para a mesma pergunta.

---

## 10. Checklist de aceitação

- Mudar a data de início na proposta recalcula todas as datas gravadas, e o Anexo III reflete na mesma geração.
- Duas propostas para campi diferentes da LSI produzem anexos com degraus diferentes.
- Escola com quatro degraus produz quatro faixas com datas no anexo, e a primeira no resumo.
- Escola com regra em dias úteis usa o calendário do país dela.
- Simulador e checkout, para o mesmo cliente no mesmo dia, retornam valor em reais idêntico até o centavo.
- Alterar a alíquota de IOF na tabela muda simulador, checkout, recibo e Anexo III sem tocar em texto.
- Calculadora de reembolso produz memória de cálculo com o estado do processo que gerou o degrau.
- Cliente que pagou só a Entrada e cancela a 20 dias produz **saldo devido**, não restituição.
- Anexo III emitido há três meses continua legível com a política da época, mesmo após atualização da escola.
- Tentativa de gerar envelope sem Anexo III completo é recusada.
- Programa com passagem e seguro produz **duas bases distintas**, e a Remuneração incide só sobre o Componente Educacional.
- Programa cuja acomodação começa antes do curso deriva todos os prazos da **data de início do curso**.
- Proposta vencida não abre, e exige reemissão.
- Pagamento sem conciliação automática não amortiza o Saldo Devedor.
