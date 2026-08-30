# Motor da Área do Cliente — Especificação v3
## Duas empresas, duas instâncias autônomas, um mesmo motor
### Novidades da v3: checkout próprio desde o MVP, fluxo Mercado Pago (PIX) como gatilho da jornada, máquina de estados revisada, Termo de Adesão

Este documento substitui a v2. Mudanças concentradas nas seções 2.1 (máquina de estados), 2.8 (novo módulo de checkout) e 6 (roadmap). As demais seções foram mantidas e ajustadas onde o novo fluxo as afeta.

---

## 1. Arquitetura de autonomia

Duas empresas separadas exigem separação real, não apenas visual. A regra de ouro: **compartilha-se o desenho, nunca o dado**.

### O que as duas instâncias compartilham
- **O blueprint deste documento**: a mesma máquina de estados, os mesmos motores, as mesmas boas práticas.
- **A base de código**, com dois deployments configurados por variável de ambiente (decisão confirmada). Cada correção ou evolução beneficia as duas empresas com um único esforço de desenvolvimento, sem criar nenhum vínculo operacional ou societário.

### O que nunca é compartilhado
| Camada | EXP Tour | Forio |
|---|---|---|
| Domínio e marca | cliente.exptour.com.br | cliente.forio.com.br (ou domínio do vendedor) |
| Organização Zoho (CRM, Sign, Flow, WorkDrive, Books) | Própria | Própria |
| Banco de dados do backend | Próprio | Próprio |
| Conta e credenciais Mercado Pago | Própria | Própria |
| Credenciais, chaves de API, webhooks | Próprias | Próprias |
| Contratos com parceiros (câmbio, visto, aéreo) | Próprios | Próprios |
| Base de clientes e consentimentos LGPD | Própria | Própria |

Não existe nenhuma query, integração ou relatório que cruze as duas bases. A instância Forio implementa o mesmo motor com uma camada adicional de permissão (operador do vendedor enxerga apenas seus clientes); é a única divergência estrutural.

---

## 2. O motor: visão geral

O motor é um conjunto de oito subsistemas orquestrados por eventos. O princípio de projeto: **nenhuma etapa da jornada avança por ação manual de atualização; toda transição nasce de um evento real** (pagamento, assinatura, upload, aprovação, data). Humanos aprovam e resolvem exceções; o motor move o resto.

```
                    ┌──────────────────────────────┐
  Eventos externos  │        BARRAMENTO DE          │
  ────────────────► │        EVENTOS (backend)      │
  Mercado Pago      └─┬───┬───┬───┬───┬───┬───┬───┬┘
  Zoho Sign           │   │   │   │   │   │   │   │
  Zoho Forms       ┌──▼┐┌─▼─┐┌▼──┐┌▼──┐┌▼──┐┌▼──┐┌▼──┐┌▼──────┐
  Zoho Books       │Chk││Jor││Fin││Doc││Lst││Not││Ret││Parcei-│
  Upload cliente   │out││nad││anc││s  ││chk││if ││orn││ros    │
  Ação do time     └───┘└───┘└───┘└───┘└───┘└───┘└───┘└───────┘
  Relógio (datas)     │
                      ▼
             Zoho CRM (fonte de verdade de status)
```

### 2.1 Máquina de estados da jornada (revisada)

A jornada é uma máquina de estados formal. Cada estado tem: evento de entrada, ações automáticas na entrada, condição de saída e responsável pela pendência (cliente ou empresa). A v3 adiciona os estados 0 e 1, que formalizam a venda dentro do motor.

| # | Estado | Evento de entrada | Ações automáticas na entrada | Sai quando |
|---|---|---|---|---|
| 0 | Proposta enviada | Consultor gera link de checkout no CRM | Envia link ao cliente (e-mail + WhatsApp); lembrete se link não aberto em 24h e não pago em 48h; proposta com validade explícita (`Proposta_Valida_Ate`) | Webhook MP `payment.approved` OU proposta expira |
| 1 | Entrada paga | Webhook `payment.approved` (Mercado Pago) | Atualiza `Entrada_Status = Paga`; recibo no cofre; e-mail de boas-vindas; provisiona login da Área do Cliente; verifica se formulário completo | Dados cadastrais completos |
| 2 | Aguardando contrato | Cadastro completo (o checkout já coleta o essencial; complemento se menor de idade) | Flow gera contrato (mestre + Anexo I) e envia via Zoho Sign; lembrete de assinatura D+2 e D+5 | Webhook Sign "assinado por todos" |
| 3 | Matrícula | Contrato assinado | Envia SignForms da escola; notifica cliente | Webhook SignForms concluído |
| 4 | Documentação | Matrícula assinada | Instancia lista de documentos exigidos (destino/programa/idade); notifica pendências | Docs obrigatórios aprovados |
| 5 | Visto | Docs aprovados | Guia do visto; oferta do parceiro despachante; lembretes por prazo do consulado | `Visto_Status = Aprovado` |
| 6 | Pré-embarque | Visto aprovado | Instancia checklist; publica passagem/acomodação/seguro no cofre; oferta do parceiro de câmbio | Data de embarque |
| 7 | Em programa | Data de embarque (relógio) | Modo "durante a viagem"; check-in automático D+3 | Data de retorno (relógio) |
| 8 | Retorno | Data de retorno | Dispara sequência de retorno (2.7) | Sequência concluída |

Mudanças estruturais em relação à v2:

- **O pagamento da entrada, não o formulário, é o gatilho-mestre.** Dinheiro é o sinal de compromisso mais confiável que existe; tudo que é oneroso para a empresa (geração de contrato, matrícula, provisionamento) só acontece depois dele.
- **O login da Área do Cliente é provisionado na entrada paga** (antes era no contrato assinado). O cliente que pagou entra imediatamente no portal e vê o contrato como sua primeira pendência, o que acelera a assinatura e dá sensação de progresso desde o minuto um.
- **Proposta expirada não morre em silêncio**: vira tarefa para o consultor com o histórico (abriu o link? gerou QR? quantas vezes?), transformando o estado 0 num mini-funil de vendas mensurável.

### 2.2 Motor de eventos e automação

Todo webhook (Mercado Pago, Sign, Forms, Books) e todo upload chegam a um único receptor no backend, que valida a assinatura do webhook, grava o evento em log imutável e despacha para o handler correspondente. Boas práticas obrigatórias:

- **Idempotência**: o mesmo webhook entregue duas vezes não gera duas notificações nem dois avanços de estado. Todo evento carrega ID único; duplicatas são descartadas. Crítico no Mercado Pago, que reenvia webhooks não confirmados.
- **Fila com retry**: se o CRM estiver indisponível, o evento espera e tenta de novo; nunca se perde.
- **Log de auditoria**: cada transição registra causa e timestamp. É o que permite responder "por que este cliente está parado há 9 dias" sem arqueologia.
- **Nunca confiar no frontend como gatilho**: a tela de "pagamento aprovado" é cortesia visual; só o webhook move a máquina.

### 2.3 Motor financeiro

- **Cotação**: job diário consome a API do BACEN (série Turismo Venda por moeda), grava em cache com data. Fórmula em todo o sistema: `BRL = valor_moeda × cotação_BACEN(data) × 1,035 × 1,066`.
- **Entrada**: convertida pela cotação do dia da geração do QR. QR PIX dinâmico com expiração de 24h; vencido, a página gera novo QR com a cotação vigente. Coerente com a cláusula 6.3 e elimina qualquer discussão de valor.
- **Parcelas**: cada parcela convertida na cotação da data do pagamento. Parcelas futuras exibidas como estimativa com a cotação do dia e aviso claro de variação. Pagamento de parcelas também via link/QR Mercado Pago gerado pelo portal (mesma infraestrutura do checkout, reaproveitada).
- **Régua de cobrança** (dunning): D-7 aviso amistoso com valor convertido do dia; D-2 lembrete com link de pagamento; D+1 aviso de atraso; D+5 segunda cobrança; D+10 abre tarefa para humano.
- **Conciliação**: `payment.approved` de parcela marca a parcela como paga no CRM/Books, gera recibo em PDF no cofre e atualiza a barra de progresso. Zero planilha paralela.

### 2.4 Motor de documentos

Fluxo de cada documento do cliente: `pendente_envio → em_analise → aprovado | rejeitado(motivo)`.

- **Validações automáticas no upload**: tipo/tamanho de arquivo, legibilidade básica; passaporte com data de validade estruturada (manual confirmada pelo cliente no MVP, OCR como evolução). Validade menor que retorno + 6 meses gera alerta imediato.
- **Fila de análise no CRM** com SLA declarado ao cliente ("até 2 dias úteis"); estouro alerta o gestor.
- **Rejeição sempre com motivo estruturado**, convertida em notificação acionável.
- **Lembretes de pendência** em cadência decrescente (D+3, D+7, semanal), silenciados na resolução.
- **Documentos da empresa** (LOA, apólice, e-ticket, voucher): publicados no WorkDrive, o motor detecta e notifica.

### 2.5 Motor de checklist

Regras declarativas em JSON, versionadas, avaliadas contra destino, programa, idade e acomodação. Instanciado na entrada do Pré-embarque; itens com prazo entram no motor de notificações; itens ligados ao cofre se marcam sozinhos quando o documento é aprovado. O time operacional mantém as regras sem tocar em código.

### 2.6 Motor de notificações

- **Matriz evento × canal**: e-mail para tudo; WhatsApp (API oficial) reservado aos momentos de alto valor: link de checkout, entrada confirmada, parcela, documento rejeitado, visto, embarque, certificado.
- **Agrupamento** de eventos do mesmo dia em mensagem única; horário comercial para o não crítico; tom por fase; templates como parte do produto.
- Todo lembrete cessa automaticamente quando a pendência é resolvida.

### 2.7 Motor de retorno

1. **D+2 do retorno**: boas-vindas + expectativa do certificado.
2. **Certificado publicado**: notificação de alto impacto.
3. **Avaliação interna** (NPS + escola + professores + acomodação + atendimento + serviços parceiros usados). NPS ≤ 6 abre tarefa humana em 24h e pausa a sequência.
4. **NPS ≥ 7 ou detrator resolvido**: convite à avaliação Google (para todos, em conformidade com as políticas do Google; a inteligência está no timing e na resolução prévia, não no filtro).
5. **D+15**: código de indicação com benefício bilateral.
6. **D+45**: sugestão de próxima jornada conforme perfil.

### 2.8 Motor de checkout (novo na v3)

Checkout próprio desde o MVP, servido pelo backend, alimentado pelo Deal do CRM, com pagamento via API do Mercado Pago (PIX/QR dinâmico).

#### Fluxo ponta a ponta

```
Consultor fecha proposta no CRM (Deal: programa, datas,
serviços, valor da entrada em moeda estrangeira)
        │
        ▼
CRM/backend gera LINK ÚNICO de checkout
   checkout.exptour.com.br/p/{token}
   token: opaco, não sequencial, com validade = Proposta_Valida_Ate
        │
        ▼
CLIENTE ABRE A PÁGINA (evento: Proposta_Aberta)
   backend lê o Deal server-side e renderiza:
   1. Resumo da proposta (programa, escola, cidade, data de
      início, duração, serviços contratados, valor total na
      moeda do programa)
   2. Valor da ENTRADA em R$, convertido pela cotação do dia,
      com memória de cálculo visível (cotação BACEN + IOF +
      taxa) e aviso de validade do valor (24h)
   3. Formulário de dados essenciais (ver campos abaixo)
   4. Aceite do TERMO DE ADESÃO (checkbox + link para o texto
      integral; registro de data/hora/IP)
   5. Botão "Gerar PIX"
        │
        ▼
BACKEND cria o pagamento na API do Mercado Pago
   POST /v1/payments  (payment_method_id: pix)
   - amount: entrada convertida do dia
   - external_reference: {deal_id}  ← chave de conciliação
   - date_of_expiration: +24h
   - notification_url: webhook próprio da instância
   devolve QR code + copia-e-cola, exibidos na página
        │
        ▼
WEBHOOK payment.approved  →  barramento de eventos
   (idempotente, logado, com retry)
   - CRM: Entrada_Status = Paga, Data_Entrada = now()
   - Recibo em PDF no cofre
   - Provisiona login + e-mail "criar senha"
   - Notificação de boas-vindas (e-mail + WhatsApp)
   - Estado da jornada → 1 (Entrada paga)
        │
        ▼
QR EXPIRADO sem pagamento
   - Página permite regenerar QR com a cotação do novo dia
   - D+1 sem pagamento: lembrete automático
   - Proposta_Valida_Ate atingida: estado → Proposta expirada,
     tarefa para o consultor com o histórico de interação
```

#### Campos do formulário do checkout

Coletar no checkout apenas o necessário para fechar a venda e emitir o contrato; o restante fica para o complemento cadastral pós-pagamento (menos atrito antes do PIX, detalhe depois do compromisso):

- **No checkout**: nome completo do contratante, CPF, data de nascimento, e-mail, celular/WhatsApp, nome completo do estudante (se diferente), data de nascimento do estudante, aceite do Termo de Adesão.
- **Pós-pagamento (estado 1)**: endereço completo, documento de identidade/passaporte, e, se o estudante for menor, dados do responsável legal (o formulário exibe os blocos condicionais e alimenta o CRM via Zoho Forms ou formulário próprio do portal).

A data de nascimento do estudante já no checkout é proposital: é ela que determina o fluxo de menor de idade (contrato multi-signatário, CTV, documentos dos responsáveis) desde o primeiro estado.

#### Termo de Adesão (estrutura do texto)

Documento curto (1 a 2 páginas), aceito por checkbox no checkout, que garante a reserva sem substituir o contrato completo:

1. Identificação das partes e do programa (dados puxados do Deal).
2. Objeto: reserva de vaga no programa descrito, condicionada à assinatura do contrato de prestação de serviços.
3. Valor total do programa na moeda de origem e valor da entrada em R$, com a regra de conversão (BACEN Turismo Venda + IOF 3,5% + taxa 5%) explicitada.
4. **Direito de arrependimento**: 7 dias corridos a partir do pagamento, com devolução integral da entrada (art. 49 do CDC, obrigatório em contratação a distância; escrever com clareza é proteção jurídica e argumento de venda: "você tem 7 dias para mudar de ideia").
5. Política de cancelamento após os 7 dias (referência à cláusula do contrato-mestre).
6. Compromisso da empresa: envio do contrato completo em até X dias úteis; a matrícula na instituição ocorre após a assinatura.
7. Tratamento de dados (LGPD): finalidade, base legal (execução de contrato), referência à política de privacidade.
8. Registro do aceite: data, hora, IP e versão do termo, gravados no CRM.

**Validação jurídica**: este é o único artefato da v3 que deve passar por advogado antes do primeiro cliente real, junto com a revisão da política de cancelamento para coerência entre Termo, contrato-mestre e página de checkout.

#### Integração Mercado Pago: especificação mínima

| Item | Especificação |
|---|---|
| Método MVP | PIX via QR dinâmico (`/v1/payments`, `payment_method_id: pix`) |
| Expiração | 24h (`date_of_expiration`), regeneração com cotação do novo dia |
| Conciliação | `external_reference = deal_id`; jamais conciliar por valor |
| Webhook | `notification_url` própria por instância; validar assinatura (`x-signature`); responder 200 rápido e processar async na fila |
| Idempotência | Chave = `payment_id` do MP; eventos repetidos descartados |
| Estorno de arrependimento (7 dias) | Refund via API (`/v1/payments/{id}/refunds`), acionado por ação do time no CRM, com registro do motivo |
| Evolução pós-MVP | Cartão de crédito para a entrada (Checkout API/Bricks na mesma página), avaliando o custo de MDR contra a conversão incremental |
| Segurança | Credenciais MP server-side apenas; frontend nunca vê access token; uma conta MP por empresa |

#### Eventos que o checkout emite para o cockpit

`Proposta_Enviada`, `Proposta_Aberta` (com contagem), `QR_Gerado` (com contagem), `Entrada_Paga`, `Proposta_Expirada`. Esses cinco eventos criam o funil de fechamento: propostas → abertas → QR → pagas, por consultor e por período. É o mini-CRM de vendas que o estado 0 entrega de graça.

---

## 3. Módulo de serviços parceiros (passagem, visto, câmbio)

| Serviço | Momento de exibição | Gatilho |
|---|---|---|
| Despachante de visto | Estado 5, no topo do guia do visto | Entrada no estado Visto |
| Passagem aérea | Após visto aprovado (nunca antes) | `Visto_Status = Aprovado` |
| Corretora de câmbio | Financeiro (remessas) e checklist de pré-embarque | Entrada no Pré-embarque |

- Oferta como **próximo passo natural da jornada**, uma vez, com "não preciso" claro.
- **Código único de rastreio** por cliente (`ref=EXP-{id}` / `ref=FORIO-{id}`); cliques como eventos no CRM; lead qualificado via webhook quando o parceiro suportar (com consentimento explícito e específico, registrado).
- **Transparência**: "serviço prestado por empresa parceira; podemos receber comissão".
- **Curadoria**: um parceiro por categoria, SLA em contrato, NPS do retorno cobre os parceiros, revisão semestral.
- Conciliação mensal de comissões pelos códigos; `Receita_Ancilar` por cliente no CRM.

---

## 4. Controle de gestão (o cockpit de cada empresa)

- **Funil de fechamento** (novo): propostas enviadas → abertas → QR gerado → entradas pagas, por consultor, com taxa e tempo médio de conversão e propostas a expirar hoje.
- **Funil operacional**: clientes por estado da jornada, tempo médio de permanência, estouros de SLA em destaque.
- **Fila de trabalho do dia**: documentos a analisar, detratores a contatar, cobranças D+10, propostas expiradas a retrabalhar.
- **Financeiro**: entradas do mês, parcelas a vencer, inadimplência por faixa, receita ancilar por parceiro.
- **Experiência**: NPS por coorte, avaliações Google geradas, taxa de indicação, ranking de fornecedores.
- **Saúde da automação**: entrega/leitura de notificações, eventos em retry, webhooks falhados.

A disciplina que sustenta tudo: o time trabalha dentro do CRM. Ação fora do sistema é ação que o motor não vê.

---

## 5. Matriz de automação

| 100% automático | Humano no loop |
|---|---|
| Link de checkout, QR PIX, recibos | Fechamento da proposta (consultor) |
| Avanço de estados por evento e por data | Aprovação/rejeição de documentos |
| Geração e envio de contrato | Atualização de `Visto_Status` |
| Lembretes, régua de cobrança até D+5 | Cobrança a partir de D+10 |
| Instanciação de checklist e docs exigidos | Contato com detrator (NPS ≤ 6) |
| Sequência de retorno, códigos de indicação | Estorno do arrependimento (7 dias) |
| Conversão cambial e estimativas | Curadoria e troca de parceiros |

Critério para novos casos: automatize informação e prazo; mantenha humano julgamento e emoção.

---

## 6. Roadmap ajustado

- **Onda 1 — Venda e núcleo do motor**: checkout próprio completo (link, página, MP, webhook, Termo de Adesão validado juridicamente), estados 0 a 3, barramento de eventos com idempotência e log, financeiro com BACEN real, notificações de e-mail, funil de fechamento básico. Critério de pronto: um cliente real vai da proposta ao contrato assinado sem nenhum estado mock e sem nenhuma ação manual de atualização de status.
- **Onda 2 — Documentos e pré-embarque**: motor de documentos, checklist por regras, WhatsApp oficial nos momentos críticos, estados 4 a 6, pagamento de parcelas pelo portal.
- **Onda 3 — Retorno e parceiros**: sequência de retorno completa, módulo de parceiros com rastreio de comissão.
- **Onda 4 — Cockpit avançado**: SLAs com alertas, ranking de fornecedores, relatórios de receita ancilar, cartão de crédito no checkout se os dados justificarem.

A instância Forio replica o blueprint quando o motor estiver validado na EXP Tour, adicionando a camada de permissão por vendedor.

---

## 7. Próximos passos

1. Redigir o Termo de Adesão e submeter à validação jurídica (item crítico da onda 1; inclui o direito de arrependimento do CDC e a coerência com o contrato-mestre).
2. Congelar a máquina de estados da seção 2.1 e criar os campos no CRM da EXP Tour: `Proposta_Valida_Ate`, `Entrada_Status`, `Data_Entrada`, `Checkout_Token`, mais os campos de status já definidos.
3. Abrir a conta/aplicação Mercado Pago da EXP Tour e configurar credenciais de produção e sandbox; especificar o webhook receiver como primeiro componente do barramento de eventos.
4. Desenhar a página de checkout (wireframe) com o resumo da proposta, memória de cálculo cambial e o fluxo do QR, e validar com um fechamento simulado de ponta a ponta em sandbox.
5. Levantar com o time da EXP Tour as regras do checklist e da lista de documentos por destino/programa/idade (insumo da onda 2).
6. Iniciar a aprovação dos templates de WhatsApp na API oficial (gargalo escondido da onda 2; o template do link de checkout entra nessa leva).
7. Selecionar os três parceiros ancilares com cláusula de rastreio, SLA e relatório mensal (insumo da onda 3).
