# Do contrato à operação

Requisitos de sistema e de processo que o Contrato v3.1 pressupõe. O objetivo é único: **tudo que o contrato promete precisa existir na operação**, porque cláusula sem execução é passivo, não proteção.

Complementa `forio-especificacao-anexo3-sistema.md`, que trata do modelo de dados do Anexo III e das calculadoras. Este documento trata da **Área do Cliente**, do **processo de matrícula** e da **rastreabilidade** entre cláusula e comportamento.

---

## 0. Mudança de premissa: o contrato não obriga mais a Área do Cliente

O Contrato v3.1 **não menciona a Área do Cliente em nenhuma cláusula**. Onde antes havia 48 menções, agora há a figura dos **Canais Oficiais**, definidos na alínea "l" da Cláusula 1.1 e listados no Quadro Resumo de cada contratação.

Isso muda a natureza de quase tudo neste documento, e para melhor.

**A obrigação contratual passou a ser informar, não construir tela.** Cada requisito abaixo continua existindo, com o mesmo conteúdo e os mesmos prazos, mas pode ser cumprido por qualquer Canal Oficial enquanto a funcionalidade correspondente não existir.

**Consequência prática de sequenciamento.** A Área do Cliente deixa de ser dívida jurídica e volta a ser decisão de produto. Constrói-se o que gera valor, na ordem que fizer sentido, e o que ainda não existe é entregue por e-mail. O que **não** muda é o prazo: se a Cláusula 9.1.3 exige memória de cálculo em 5 dias úteis, ela sai por e-mail se a tela não existir.

**O que continua sendo obrigação de existir**, por exigência do Decreto 7.962/2013 e das Cláusulas 17.3 e 18.2.1: ambiente de acesso permanente à via integral do contrato, do Quadro Resumo e dos Anexos, com download e impressão. Isso pode ser um link permanente, não precisa ser um portal.

**Registro dos Canais Oficiais.** O Quadro Resumo tem campo próprio listando quais são naquela contratação. Alterar a lista para contratações futuras não exige emendar as Condições Gerais. Alterar para contratações em curso, sim.

---

## 1. Princípio de leitura

Cada requisito abaixo existe porque uma cláusula o exige. A coluna de cláusula não é referência bibliográfica, é a razão pela qual o requisito não pode ser cortado no escopo.

Três categorias, e a diferença importa:

**Bloqueio.** Impede avanço. Se falhar, o contrato perde eficácia naquele ponto.
**Prazo.** Obrigação com relógio. Se falhar, gera mora da Forio ou perda de direito.
**Registro.** Prova. Se falhar, a cláusula existe mas não se demonstra em disputa.

---

## 2. Processo de matrícula: máquina de estados

| # | Estado | Gatilho de entrada | O que o sistema faz | Cláusula |
|---|---|---|---|---|
| 1 | Proposta emitida | Consultor gera proposta | Calcula e **grava** todas as datas a partir da **data de início do curso**, monta Anexo III do campus, envia por e-mail com registro de envio e recebimento. Grava validade da proposta, padrão **5 dias corridos** | 2.5.a |
| 2 | Interesse manifestado | Cliente clica em avançar | Registra data e hora. **Não** constitui contratação | 2.5.a.1 |
| 3 | Envelope 1 emitido | Interesse registrado | Monta envelope com 5 documentos e a caixa de ciência no Anexo III | 2.5.b, III.7 |
| 4 | Contrato assinado | Assinatura concluída | Grava data, hora, IP, versão, hash. **Inicia relógio de arrependimento (7 dias)** e de Entrada (5 dias) | 2.5.b, 8.1, 7.2 |
| 5 | Meios disponibilizados | Assinatura concluída | Disponibiliza, **em até 1 dia útil** e pelos Canais Oficiais, os meios para pagar, acompanhar e acessar os documentos, a partir dos dados cadastrais | 2.5.c |
| 6 | Entrada paga | PIX **conciliado automaticamente** | Confirma, amortiza saldo, emite recibo. **Comprovante enviado pelo cliente não substitui a conciliação** | 7.2, 6.5.2, 6.5.3 |
| 7 | Envelope 2 emitido | Entrada confirmada | Envia ficha de matrícula bilíngue com o campo de processamento imediato | 2.5.e, 8.4 |
| 8 | Ficha assinada | Assinatura concluída | Registra se o campo de processamento imediato foi marcado | 8.4 |
| 9 | Aguardando fim do arrependimento | Ficha assinada, campo **não** marcado | **Bloqueia** qualquer envio ao Fornecedor até D+7. Libera no primeiro dia útil seguinte | 2.5.2 |
| 9b | Processamento imediato | Campo marcado | Libera envio antes de D+7. Registra a autorização | 2.5.2.1, 7.4.3.7 |
| 10 | Documentação recebida | Uploads do cliente completos | Valida checklist do destino | 5.1 |
| 11 | Matrícula submetida | Ficha + documentação + liberação | Submete ao Fornecedor. **Muda o degrau de cancelamento de 0% para 2%** | I.2 |
| 12 | Documentos da escola recebidos | Retorno do Fornecedor | Publica na Área do Cliente. **Abre prazo de 3 dias úteis para conferência pelo cliente**. Degrau passa a 3,5% | 5.1.k, I.2 |
| 13 | Visto instruído | Pedido protocolado | Degrau passa a 5% | I.2 |
| 14 | Quitado | Saldo Devedor = 0 | Libera remessa conforme prazo do Fornecedor | 7.4 |
| 15 | Remetido ao Fornecedor | Data-limite do Fornecedor | Remete. **Nunca antes** do prazo dele, salvo aprovação registrada | decisão operacional |
| 16 | Em andamento | Data de início | A partir daqui aplica-se a Cláusula 9.5 | 9.5 |
| 17 | Concluído | Data de término | Publica certificado em até 7 dias. Abre depoimento | 16.1 |

**Estados paralelos:** mora, repactuação, alteração de programa, cancelamento e arrependimento podem ocorrer a partir do estado 4 e têm máquinas próprias.

### 2.1. Regra crítica de degrau

O degrau da Remuneração por Serviços Prestados é o **maior** entre o derivado do estado, acima, e o derivado da data. **Programa a menos de 30 dias do início força 5%**, qualquer que seja o estado. A memória de cálculo precisa registrar **qual dos dois** determinou o degrau.

---

## 3. Área do Cliente, como produto

O que segue descreve a Área do Cliente como **produto**, não como obrigação contratual. Cada linha indica a cláusula que exige a **informação**, que pode ser entregue por outro Canal Oficial enquanto a tela não existir. Isso permite priorizar por valor e ainda assim saber o que não pode faltar.

### 3.1. Três perfis de acesso

| Perfil | Quando | O que vê |
|---|---|---|
| Contratante | Após assinatura, em até 1 dia útil | Tudo |
| Participante | Se o Contratante autorizar no Quadro Resumo | Programa e documentação de viagem. **Nunca** saldo, valores ou histórico de pagamentos |
| Terceiro pagador | Nunca | Nenhum acesso. A cobrança destina-se ao Contratante ou ao Participante, e quem liquida por repasse do código não adquire acesso nem direito (Cl. 7.1.1.1) |

O bloqueio financeiro do perfil Participante é requisito da Cláusula 5.4.4 e é também questão de LGPD, porque saldo é dado do Contratante.

### 3.2. Telas obrigatórias

| Tela | O que exibe | Cláusula |
|---|---|---|
| Saldo | Saldo Devedor na moeda e equivalente em Reais pela cotação do dia | 7.12, 6.8.d |
| Datas | Data-limite de quitação, lida do Quadro Resumo, e antecipação quando houver | 7.12 |
| Plano sugerido | Rotulado como **sugestão**, nunca como parcela devida, com a data-limite exibida junto | 7.13.2 |
| Ajustar plano | Alterar datas e valores sem autorização, sem custo, com recálculo | 7.14, 7.14.4 |
| Gerar cobrança | Cotação, taxa de 5%, IOF, valor em Reais e amortização, **antes** de confirmar. Validade até 23h59 | 6.5 |
| Histórico e recibos | Por pagamento: PTAX e sua data, taxa, IOF, amortização, saldo restante, e o pagador quando distinto | 6.5.2 |
| Documentos | Upload do cliente e recebimento dos documentos da escola, com status | 5.1.h |
| Status do processo | Visto, carta da escola, contrato, em tempo real | 7.12 |
| Contrato | Via integral, Quadro Resumo, Anexos e **certificado de auditoria**, com download. **Único item que exige ambiente de acesso permanente** | 17.3, 18.2.1 |
| Arrependimento | **Botão específico**, disponível durante os 7 dias | 8.2 |
| Cancelamento | Canal com identificação de Contratante e Programa, e memória de cálculo | 9.1.2, 9.3 |
| Suporte | Chat da Forio e acesso ao WhatsApp de atendimento humano | 2.4.g |
| Certificado e depoimento | Após conclusão | 16.1 |

### 3.3. Vocabulário travado na interface

Consequência direta das Cláusulas 7.13.1 a 7.13.3. Se a interface disser "parcela" ou "vencimento" para o plano sugerido, cria obrigação que o contrato nega.

| Nunca exibir | Exibir |
|---|---|
| Parcela 3 de 12 | Você já amortizou X de Y |
| Vencimento, para pagamento mensal | Data obrigatória, só para a quitação |
| Em atraso, antes da data de quitação | Nada |
| Próxima parcela | Próxima sugestão |
| Fatura | Cobrança |
| Renegociar | Repactuar, e só sobre a data de quitação |
| Valor guardado na sua moeda | Você já amortizou X na moeda do curso |
| Nomear a Área do Cliente como obrigação em documento contratual | Canais Oficiais |

A última linha é a mais sensível: a conversão para a Moeda de Referência é decisão de tesouraria e **não pode ser comunicada como segregação**, sob pena de criar expectativa de custódia que a estrutura não entrega.

---

## 4. Comunicações com prazo

Toda linha abaixo é obrigação com relógio. Sem automação e sem registro de data e hora, a Forio descumpre por omissão e a prova fica contra ela.

| Evento | Prazo | Cláusula |
|---|---|---|
| Confirmação de recebimento do arrependimento | **Imediata**, mesmo canal e e-mail | 8.2.1 |
| Restituição por arrependimento | **48 horas** | 8.3 |
| Confirmação de recebimento do cancelamento | **Imediata** | 9.1.3 |
| Memória de cálculo preliminar | 5 dias úteis | 9.1.3.a |
| Solicitação de retenção ao Fornecedor | 1º dia útil seguinte | 9.1.3.b |
| Memória de cálculo definitiva | 5 dias úteis da resposta do Fornecedor | 9.1.3.b |
| Restituição por cancelamento | 30 dias, ou 15 dias do ingresso repatriado | 9.4 |
| Provisionamento do acesso | 1 dia útil | 2.5.c |
| Alertas de quitação | 30, 15 e 5 dias antes | 7.12 |
| Comunicação de antecipação exigida | **Imediata**, com comprovante | 7.5.5 |
| Comunicação de exigência superveniente | **Imediata**, com comprovante | 7.5.6 |
| Repasse da carta de recusa de visto ao Fornecedor | 1 dia útil do recebimento | 10.3.1 |
| Correção de erro manifesto de cotação | 2 dias úteis | 4.4 |
| Cobranças amigáveis antes da resolução | 2, com oferta de repactuação | 13.3 |
| Resolução por inadimplemento | 10 dias da segunda cobrança | 13.2 |
| Comunicação de descontinuidade de Fornecedor | **Imediata**, com alternativa equivalente | 14.4 |
| Comunicação de divergência de política de Fornecedor | **Imediata**, com o documento do Fornecedor | 18.1.2 |
| Comunicação do cancelamento ao Fornecedor | **Imediata**, no máximo 1º dia útil | 9.1.3.1 |
| Validade da proposta | 5 dias corridos, ou o prazo indicado nela | 2.5.a |

**Regra geral:** prazo com a palavra "imediata" precisa ser disparo automático, não tarefa humana. Prazo em dias úteis precisa do calendário de São Paulo, na forma da Cláusula 18.6.

---

## 5. Bloqueios

Impedem gravação ou avanço. Não são avisos.

| Bloqueio | Cláusula que depende |
|---|---|
| Proposta com início posterior ao horizonte de preço confirmado da escola | 6.1.1 |
| Envelope 1 sem Anexo III completo **daquele campus** | 7.5.4, 9.1.1, 1.1.f |
| Envelope 1 sem a caixa de ciência do Anexo III | III.7 |
| Envelope 2 emitido antes da Entrada confirmada | 2.5.e |
| Campo de processamento imediato pré-marcado ou obrigatório | 8.4, 7.4.3.7 |
| Qualquer envio ao Fornecedor antes de D+7, sem processamento imediato | 2.5.2 |
| Remessa ao Fornecedor antes do prazo dele, sem aprovação registrada | operacional |
| Data-limite de quitação calculada em tempo de leitura | 7.4, art. 397 CC |
| Antecipação exigida sem comprovante do terceiro anexado | 7.5.3 |
| Antecipação exigida com o item 7 do Quadro Resumo marcado "Não" | 7.5.1 |
| Alteração de preço processada sem aceite expresso registrado | I.3.3, 7.4.3.4, 18.1.2 |
| Alteração de plano tratada no mesmo fluxo da repactuação | 7.14.2, 7.14.3 |
| Restituição enviada a conta diversa da do Contratante, em cancelamento | 9.4 |
| Amortização registrada sem conciliação automática do pagamento | 6.5.3 |
| Proposta aberta após o fim da validade, sem reemissão | 2.5.a |
| Base da Remuneração incluindo passagem, seguro ou serviço de terceiro | I.2.8 |
| Prazo calculado a partir de data diversa da **data de início do curso** | 1.1.b |

O penúltimo merece nota. Se ajustar plano cair no mesmo fluxo de repactuação, o cliente passa por uma aprovação que a Cláusula 7.14.2 diz não existir, e a plataforma descumpre o contrato sozinha.

---

## 6. Registros obrigatórios

Prova. Sem eles, a cláusula existe e não se demonstra.

| Registro | Para que serve |
|---|---|
| Envio dos documentos com a proposta, com comprovante | Art. 46 do CDC, base de tudo |
| Certificado de auditoria do Envelope 1, com hash e versão | 17.1, prova da manifestação de vontade |
| Caixa de ciência do Anexo III, com página e coordenadas | Conhecimento prévio das retenções e prazos |
| Snapshot versionado do Anexo III emitido | 18.2.1, e defesa quando a escola alterar a política depois |
| Snapshot datado das políticas extraídas de site | Torna a mudança da escola descumprimento demonstrável |
| Data e hora de cada comunicação da seção 4 | 7.5.5, 8.2.1, 9.1.3 |
| Marcação do campo de processamento imediato | 8.4, base da dedução |
| Aceite expresso de alteração de preço | I.3.3, evita aumento unilateral |
| Estado do processo em cada transição | Determina o degrau de cancelamento |
| Comprovante da exigência do terceiro | 7.5.3 |
| Comprovação de remessa e de tentativa de recuperação, em insolvência | 14.4.2, torna o valor dedutível |

---

## 7. Fora do sistema: o que precisa existir na operação

Nem tudo é software.

**Acordos de representação.** Política do Fornecedor como anexo datado e versionado, prazo mínimo de aviso para alteração, cláusula de grandfathering para alunos já matriculados, e definição de a quem o reembolso é pago. Sem isso, cada política que vive em site é gatilho latente do item 7.5.6.

**Monitoramento das políticas publicadas.** Verificação periódica das escolas cuja política vem de site, com snapshot. Mudança detectada cedo raramente gera prazo insuficiente. Detectada quando o invoice chega, quase sempre gera.

**Critério de curadoria por proteção estudantil.** O campo novo do Anexo III registra se o destino tem conta fiduciária, fundo de proteção ou garantia obrigatória. É a mitigação real da responsabilidade solidária na cadeia, que a Cláusula 14.4 reduz mas não elimina.

**Horizonte de venda por escola.** Data até a qual há preço confirmado. Vender além disso transfere para a Forio o risco de reajuste, que a Cláusula 6.1.1 declara que ela absorve.

**Horário do atendimento humano.** A Cláusula 2.4.g fala em canais e horários divulgados. Enquanto não houver horário definido, nada pode divulgar prazo de resposta, e o Chat da Forio tem instrução de nunca estimar.

---

## 7-A. Como amarrar o bloqueio da Cláusula 2.5.2

A cláusula diz que nada vai ao Fornecedor antes do fim dos 7 dias. Amarrar isso tem duas metades: **impedir o envio** e **preservar o direito de deduzir** quando o envio é autorizado pelo cliente.

### 7-A.1. Uma flag, checada no lugar certo

O erro comum é implementar como regra de tela. Regra de tela não protege, porque o envio de verdade acontece em outro lugar.

```
liberado_para_fornecedor =
      (agora > data_fim_arrependimento)
   OR (processamento_imediato_marcado_em IS NOT NULL)
```

`data_fim_arrependimento` é **gravado** no momento da assinatura, a partir do carimbo de tempo do envelope, e nunca recalculado em leitura.

Essa flag precisa ser checada **na camada de integração**, não na interface, por quatro funções:

1. envio de documentos ao Fornecedor
2. submissão do pedido de matrícula
3. reserva de acomodação
4. execução de remessa financeira

Se a checagem estiver só na tela, o bloqueio existe no papel e falha na prática.

### 7-A.2. O ponto cego é o e-mail manual

Nenhum bloqueio técnico impede um consultor de escrever para a escola do Zoho Mail no dia 3. E é assim que a Cláusula 2.5.2 será descumprida, não por falha de código.

Três controles, em ordem de eficácia:

**Comunicação com Fornecedor pelo sistema.** Se o e-mail à escola sai de dentro da plataforma, ele é logado e pode ser bloqueado pela mesma flag. É o único controle que fecha o furo.

**Regra de processo escrita e treinada.** Nenhum contato com a escola sobre um aluno específico antes do dia 8, salvo flag ligada. Precisa estar no onboarding do consultor, não em um documento que ninguém lê.

**Auditoria por amostragem.** Comparar, por amostra mensal, a data do primeiro contato registrado com a escola contra `data_fim_arrependimento`. Divergência é incidente, não observação.

### 7-A.3. Por que o bloqueio vale dinheiro

Se a Forio enviar antes de D+7 **por iniciativa própria**, e o cliente se arrepender, a restituição é integral em 48 horas e **nada pode ser deduzido**. A dedução da Cláusula 8.4 só existe quando foi o cliente quem pediu.

Ou seja: um envio antecipado sem a flag ligada converte uma retenção da escola em prejuízo direto da Forio, sem instrumento de recuperação. É por isso que este é o bloqueio mais caro da lista.

---

## 7-B. Como preservar o direito de deduzir

A dedução da Cláusula 8.4 depende de **três provas cumulativas**. Faltando uma, a dedução cai inteira.

| Prova | O que precisa existir | Onde vive |
|---|---|---|
| **1. Pedido do cliente** | Campo marcado na ficha, próprio, não pré-assinalado, não obrigatório para prosseguir | Envelope 2, com carimbo de tempo e coordenadas |
| **2. Informação prévia da consequência** | O texto que o cliente leu ao marcar, na versão exata daquela ficha | Snapshot versionado da ficha assinada |
| **3. Comprovação da retenção** | Documento do Fornecedor confirmando o valor efetivamente retido | Anexado ao processo de reembolso |

### 7-B.1. A terceira é a que mais se perde

As duas primeiras são automáticas se o envelope estiver bem montado. A terceira depende de alguém pedir à escola, e é a que falha.

O item I.1 do Anexo I só permite deduzir o que for **comprovadamente** não recuperável. Sem o documento da escola, a Forio tem o direito e não consegue exercê-lo.

**Rotina obrigatória:** arrependimento exercido após processamento imediato dispara, no mesmo dia, solicitação escrita ao Fornecedor confirmando o valor retido. Sem resposta, a Forio não deduz. Isso conecta com o item 9.1.3, que já prevê memória preliminar e definitiva justamente porque a resposta da escola demora.

### 7-B.2. Deduz-se o retido, não o remetido

Se a Forio remeteu 500 e a escola devolveu 300, deduz-se 200. Não 500. A memória de cálculo precisa mostrar as três linhas: remetido, devolvido, retido.

### 7-B.3. O texto do campo na ficha

Precisa dizer a consequência, não apenas pedir a autorização. Sugestão:

> **[ ]** Solicito o processamento imediato da minha matrícula, antes do fim do meu prazo de 7 dias de arrependimento. Estou ciente de que, se eu desistir nesse prazo, os valores que a escola comprovadamente retiver poderão ser descontados da minha restituição, e que **sem esta solicitação a restituição seria integral**.

A última oração é a que torna a escolha informada, e é ela que sustenta a dedução se houver questionamento. Precisa existir nas duas versões da ficha bilíngue, com redação equivalente.

---

## 7-C. Como certificar o destaque das cláusulas limitativas

O negrito é condição de eficácia pelo artigo 54, § 4º, do CDC, e é o requisito mais fácil de perder silenciosamente, porque some numa conversão e ninguém percebe.

### 7-C.1. Redundância antes de verificação

Verificar é bom. Não depender de um único mecanismo é melhor. Duas camadas que sobrevivem a pipelines diferentes:

**Negrito**, que é o padrão e o que a jurisprudência reconhece sem discussão.

**Um segundo marcador visual**, que sobreviva mesmo se o negrito cair. Moldura ou faixa lateral na cláusula, ou caixa alta na frase central, como a Cláusula 6.7 já faz. Moldura é preferível porque não prejudica a leitura.

A nota já inserida no cabeçalho do contrato, dizendo que as cláusulas em negrito são as limitativas e listando quais, é uma terceira camada: ela **nomeia** as catorze, então mesmo que a formatação falhe, o documento identifica quais são.

### 7-C.2. Verificação automática no pipeline

Teste que roda na geração do PDF e **falha o build**, não apenas alerta:

```
para cada clausula em [3.1, 3.2, 5.2, 6.7, 7.1, 7.4, 7.4.0,
                       7.5, 7.5.3, 7.5.4, 7.9, 9.5, 12.2, 12.4]:
    extrair o parágrafo correspondente do PDF gerado
    afirmar que a fonte aplicada é a variante bold
    afirmar que o marcador visual secundário está presente
```

Extração de fonte por parágrafo é viável com as bibliotecas usuais de PDF. O importante é o teste rodar **sobre o PDF final**, e não sobre o markdown de origem, porque é na conversão que a formatação se perde.

### 7-C.3. Verificação sobre o artefato que importa

O template pode estar correto e o envelope sair errado. Por isso a amostragem mensal deve ser feita **sobre um envelope efetivamente assinado**, baixado do Zoho Sign, não sobre o modelo.

Checklist de dois minutos, uma vez por mês:

- Baixar um envelope assinado do mês
- Confirmar que os cinco documentos estão nele
- Confirmar que as catorze cláusulas estão destacadas
- Confirmar que a caixa de ciência do Anexo III foi marcada
- Confirmar que o Anexo III é do campus correto
- Confirmar que o certificado de auditoria traz data, hora, IP e hash

Se algum item falhar, o problema não é daquele contrato, é de todos os emitidos desde a última verificação. Por isso mensal, e não semestral.

---

## 7-D. Redundância de controle em todo o processo

O princípio do negrito vale para o processo inteiro: **nenhum ponto crítico deve depender de um único mecanismo**. Cada um recebe três camadas, e as três têm naturezas diferentes de propósito, porque falham por razões diferentes.

**Preventivo.** Impede o erro. É automático e roda antes do ato.
**Detectivo.** Encontra o erro que passou. É automático e roda depois.
**Corretivo.** Confirma que o que chegou ao cliente está certo. É humano, por amostragem, sobre o artefato real.

Controle preventivo falha por bug ou por caminho alternativo, como o e-mail manual. Detectivo falha por ninguém olhar o alerta. Corretivo falha por não ser feito. As três juntas raramente falham no mesmo mês.

| Ponto crítico | Preventivo | Detectivo | Corretivo mensal |
|---|---|---|---|
| Nada ao Fornecedor antes de D+7 | Flag na camada de integração, nas 4 funções | Comparar data do 1º contato registrado com `data_fim_arrependimento` | Amostra: verificar se houve e-mail manual fora do sistema |
| Anexo III completo e do campus correto | Bloqueio na emissão do envelope | Job diário: envelopes emitidos sem campo obrigatório | Abrir 1 envelope assinado e conferir campus e completude |
| Destaque das cláusulas limitativas | Teste que falha o build sobre o PDF final | Marcador visual secundário sobrevive se o negrito cair | Conferir as 14 no envelope assinado |
| Caixa de ciência marcada | Campo obrigatório no envelope | Job: envelopes concluídos sem o campo | Conferir no envelope assinado |
| Processamento imediato não pré-marcado | Regra de montagem da ficha | Job: fichas com o campo marcado em massa, o que indica pré-seleção | Abrir 1 ficha e conferir estado inicial |
| Data-limite lida, nunca calculada | Campo gravado, sem fórmula em leitura | Comparar data exibida no simulador, no checkout e no Quadro Resumo | Conferir as três superfícies para 1 cliente |
| Comunicações com prazo | Disparo automático | Painel de SLA com prazos estourados | Conferir 1 caso de cada tipo ocorrido no mês |
| Remessa não anterior ao prazo do Fornecedor | Bloqueio na função de remessa | Job: remessas com data anterior ao prazo cadastrado | Conferir exceções aprovadas |
| Comprovação de retenção antes de deduzir | Bloqueio: não fecha memória definitiva sem documento anexado | Job: reembolsos com dedução sem comprovante | Conferir 1 memória de cálculo emitida |
| Alteração de preço com aceite | Bloqueio no processamento | Job: alterações processadas sem aceite registrado | Conferir 1 caso |

**Regra de escalonamento.** Falha encontrada pelo detectivo ou pelo corretivo não é caso isolado: presume-se que atinge **todos os registros desde a última verificação**. Por isso o ciclo é mensal e não semestral, e por isso todo achado exige varredura retroativa até a checagem anterior.

---

## 7-E. Fluxo de cancelamento deliberado

Objetivo duplo, e ele parecia contraditório: avisar a escola o mais rápido possível, porque isso reduz a retenção, e ao mesmo tempo garantir que o cliente saiba o que está fazendo.

**A saída é colocar a deliberação antes da manifestação, não depois dela.** O cliente passa pela tela de consequências e confirma. A confirmação é a manifestação inequívoca. Só então a escola é avisada, imediatamente. Assim não há atraso a recuperar e não há cancelamento por impulso.

### 7-E.1. Seis passos

| Passo | O que acontece | Registro | Cláusula |
|---|---|---|---|
| 1 | Cliente aciona "quero cancelar" | Intenção registrada. **Ainda não é cancelamento** | 9.1.2 |
| 2 | Sistema roda a calculadora de reembolso na data de hoje | Snapshot do cálculo | 9.1.2.1 |
| 3 | Tela de consequências, com os sete itens abaixo | Snapshot do que foi exibido | 9.1.2.1 |
| 4 | Tela de alternativas, apresentada **antes** do botão de confirmar | Qual alternativa foi ofertada | I.3, 7.11 |
| 5 | Confirmação expressa, nomeando o valor estimado | Data, hora, e a estimativa exibida | 9.1.2.2 |
| 6 | Comunicação ao Fornecedor, imediata | Data e hora do envio | 9.1.3.1 |

### 7-E.2. O que a tela de consequências mostra

Sete itens, todos calculados, nenhum genérico:

1. Etapa concluída hoje, e por consequência o degrau aplicável
2. Retenção estimada do Fornecedor, conforme o Anexo III daquele cliente
3. Remuneração por Serviços Prestados, com o percentual e o valor
4. IOF e taxa de 5% já incorridos e não estornáveis
5. **Valor estimado a restituir**, ou **valor que ele passará a dever**, quando a retenção superar o pago
6. Prazo estimado de reembolso, decomposto nas três etapas
7. **A data em que a retenção do Fornecedor aumenta**, se houver degrau à frente

O item 7 é o mais útil e o menos óbvio. Um cliente que descobre que cancelar hoje custa menos do que cancelar em dez dias decide melhor, e a Forio deixa de receber o pedido na véspera do degrau.

### 7-E.3. Alternativas antes do botão

Não é retenção por atrito, é encaminhamento por causa. O motivo declarado pelo cliente determina o que aparece:

| Motivo | Alternativa oferecida | Custo |
|---|---|---|
| Data não serve mais | Remarcação, na forma do item I.3 | Sem cobrança da Forio |
| Não consigo pagar até a data | Repactuação, na forma da Cláusula 7.11 | Taxa administrativa, se houver, informada antes |
| Mudei de destino ou de objetivo | Troca de curso, destino ou instituição | Sem cobrança da Forio |
| Quem viaja mudou | Substituição do Participante, item I.3.6 | Sem cobrança da Forio |
| Não é nenhum desses | Segue para confirmação | |

Vale registrar o motivo mesmo quando o cliente segue para o cancelamento. É o dado que mostra, em três meses, onde o produto está perdendo gente.

### 7-E.4. Deliberado, não burocrático

A diferença está em o atrito ser **informativo** e não **processual**. O fluxo acima tem uma tela a mais e nenhuma espera, nenhuma ligação obrigatória, nenhum formulário para preencher e nenhum prazo de reflexão imposto.

Isso importa juridicamente: dificultar o cancelamento é prática vedada. O que se está fazendo é o contrário, é **informar antes de decidir**, que é exatamente o que o artigo 6º, III, do CDC exige. E o snapshot da tela de consequências é a prova de que a informação foi dada.

### 7-E.5. Retratação

Como a escola é avisada de imediato, a retratação depois do passo 6 fica sujeita à aceitação dela, na forma do item 9.1.5. Na prática, escola costuma reinstalar sem custo quando o pedido chega no mesmo dia.

**Antes do passo 5, não há o que retratar**, porque não houve cancelamento. É mais uma razão para a deliberação estar antes e não depois.

---

## 7-F. Agentes de retaguarda

Correção do desenho anterior: os agentes especializados **não têm contato com o cliente**. O cliente vê a Área do Cliente, o Chat da Forio e o WhatsApp, e nada além disso.

Os agentes são **camada de retaguarda**, e a função deles é exatamente a camada detectiva da seção 7-D: encontrar o erro que o controle preventivo deixou passar, antes que ele chegue ao cliente.

**Consequência boa:** sem contato com o cliente, os limites regulatórios que eu havia levantado desaparecem. Não há aconselhamento migratório, não há corretagem de seguro, não há atuação como instituição de câmbio. Um agente que confere se a apólice cobre o mínimo do destino não está intermediando seguro, está conferindo um campo. Por isso o contrato foi revertido para mencionar apenas o Chat da Forio.

### 7-F.1. Os agentes e o que cada um verifica

| Agente | Verifica | Aciona |
|---|---|---|
| Documentação | Checklist completo do destino, validade de passaporte contra a exigência do país, **consistência de nome, data de nascimento e passaporte entre todos os documentos** | Alerta ao consultor e ao cliente pelo Chat da Forio |
| Financeiro | PTAX aplicada confere com a do dia, alíquota de IOF vigente, taxa de 5%, valor cobrado igual ao simulado, imputação na ordem da Cláusula 7.8 | Bloqueia recibo divergente |
| Vistos | Requisitos publicados do consulado, janelas de validade de documento, **prazo para apresentação da carta de recusa** conforme o Anexo III | Tarefa com prazo, na forma da Cláusula 10.3.1 |
| Passagens | Datas do bilhete compatíveis com as do Programa, compra posterior à confirmação e ao visto | Alerta |
| Seguro | Apólice apresentada antes do embarque, cobertura contra o mínimo do destino, vigência cobrindo todo o período | Alerta escalonado, na forma do item 11.1.2 |
| Tesouraria | Conversão conciliada com o recebimento, remessa não anterior ao prazo do Fornecedor, posição em moeda por contrato | Bloqueia remessa fora do prazo |
| Políticas de Fornecedor | Monitora as páginas das escolas cuja política vem de site, gera snapshot datado, detecta alteração | Abre incidente, avalia item 7.5.6 |
| Conformidade contratual | Roda a tabela inteira da seção 7-D: Anexo III completo e do campus certo, ciência marcada, nada enviado antes de D+7, campo de processamento imediato não pré-marcado, aceite de alteração de preço registrado, comprovação anexada antes de deduzir | Abre incidente e dispara varredura retroativa |

O último é o mais importante e é o que costuma não existir. Sem ele, os outros sete verificam o processo e ninguém verifica os verificadores.

### 7-F.2. Três regras que valem para todos

**Humano na decisão que afeta o cliente.** Agente detecta, alerta e bloqueia processo interno. Decisão que produza efeito sobre o Contratante passa por pessoa. Isso não é preferência, é o artigo 20 da LGPD, e por isso o contrato ganhou o item 15.5.1 declarando supervisão humana e o direito de revisão.

**Achado presume abrangência.** Divergência encontrada não é caso isolado. Dispara varredura retroativa até a última verificação limpa, na forma da regra de escalonamento da seção 7-D.

**Sem canal com o cliente.** Se um achado precisa chegar ao cliente, chega **pelo Chat da Forio ou pelo consultor**, nunca pelo agente. O cliente tem três portas: Área do Cliente, Chat da Forio e WhatsApp. Abrir uma quarta desfaz o desenho.

---

## 8. Rastreabilidade inversa

Cláusulas que **só funcionam** se a operação executar. Se algum desses requisitos não for implementado, a cláusula correspondente vira promessa descumprida, e não proteção.

| Cláusula | Sem o requisito, o que se perde |
|---|---|
| 2.5.2 | A proteção do prazo de arrependimento. Toda desistência vira prejuízo direto |
| 8.4 | O direito de deduzir valores retidos pela escola |
| 7.5.4 | A base para exigir qualquer antecipação, por força do art. 46 do CDC |
| 7.4 | A mora automática do art. 397 do Código Civil, e com ela multa, juros e negativação |
| 9.1.3 | A defesa contra alegação de demora no reembolso |
| 8.2.1 | Conformidade com o art. 5º, § 4º, do Decreto 7.962/2013 |
| 14.4.2 | A dedutibilidade do valor perdido em insolvência de Fornecedor |
| I.3.3 e 18.1.2 | A validade da alteração de preço, que sem aceite vira aumento unilateral |
| III.7 | A prova de conhecimento prévio das retenções |
| 54, § 4º, do CDC | A eficácia das catorze cláusulas limitativas, se o negrito não sobreviver ao PDF |
| 6.5.3 | A defesa contra comprovante adulterado ou pagamento não identificado |
| I.2.8 | A coerência da tabela de cancelamento, que cobra por etapas da escola |
| 1.1.b | A certeza da data-limite, quando acomodação e curso começam em datas diferentes |
