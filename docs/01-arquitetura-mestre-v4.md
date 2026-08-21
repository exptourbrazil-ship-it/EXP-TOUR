# Arquitetura-Mestre — Área do Cliente Forio / EXP Tour
## Documento consolidado v4: jornada completa, todos os cenários de cliente e catálogo de eventos (felizes e de exceção)

Consolida e substitui: Motor v3, Módulo Fornecedores v2, Motor Financeiro/Parcelamento e Auditoria de Lacunas. Duas instâncias autônomas (dados, Zoho, Mercado Pago, parceiros e clientes 100% separados), uma base de código, este blueprint.

> **Nota de reconciliação (vale sobre este documento).** O princípio 1 abaixo diz
> "o CRM é a única fonte de verdade" — isso refletia o plano original de construir
> sobre o stack Zoho. A decisão **vigente e implementada** é a inversa: **o Supabase
> é a fonte de verdade operacional; o Zoho é uma camada comercial sincronizada**
> (ver `plano-desenvolvimento-v2.md`, Seção 1, e `estado-do-portal.md`). Onde este
> doc disser "CRM", leia "Supabase (fonte de verdade) + Zoho como consumidor de
> eventos". O princípio real preservado é o que importa: **uma única fonte de
> verdade, eventos movem tudo, o Zoho nunca vira uma segunda verdade.**

---

## 1. Princípios invariantes

1. **CRM é a única fonte de verdade**; o portal é uma view. Toda leitura server-side, atrás de funções isoladas.
2. **Nada avança por atualização manual**: toda transição nasce de evento real (pagamento, assinatura, upload, aprovação, data, decisão registrada).
3. **Barramento de eventos** com idempotência, fila com retry e log imutável de auditoria.
4. **A dívida vive na moeda do programa**; R$ é derivado pelo fator do dia (BACEN Turismo Venda × 1,035 IOF × 1,066 spread, parâmetros por instância).
5. **Automatize informação e prazo; mantenha humano julgamento e emoção.** Toda exceção tem caminho desenhado com pontos de decisão humana explícitos.
6. **A jornada principal é linear; exceções são processos que a suspendem e retomam** (seção 4). Isso mantém a máquina compreensível mesmo cobrindo dezenas de cenários.

---

## 2. Cenários de cliente (quem a plataforma precisa suportar)

O modelo de dados que resolve todos os cenários é: **Contratante (conta) → 1..N Casos (estudante + programa + fornecedor) → papéis por caso**. Nunca "um login = um estudante = um programa".

| # | Cenário | O que exige do modelo |
|---|---|---|
| C1 | Maior de idade, contratante = estudante | Caso simples, 2 assinaturas no contrato |
| C2 | Menor de idade, contratante = responsável | Bloco multi-signatário (responsável + testemunhas), CTV no checklist, dados do responsável, papéis distintos (pai vê financeiro; estudante vê jornada/checklist) |
| C3 | Contratante ≠ estudante, ambos maiores (pai paga para filho de 19) | Mesmo mecanismo de papéis do C2, sem o aparato jurídico de menor |
| C4 | Múltiplos estudantes por contratante (irmãos; família junta) | N casos sob a mesma conta, financeiro consolidado opcional na visão do contratante, jornadas independentes por caso |
| C5 | Casal/amigos no mesmo programa | Dois casos vinculados (`Grupo_Id`), acomodação conjunta como atributo, comunicação individual |
| C6 | Grupo com líder (excursões EXP Tour) | `Grupo_Id` com papel Líder (vê jornada de todos os casos do grupo, sem financeiro individual), checklist e embarque coletivos, fornecedor recebe roster consolidado |
| C7 | Contratante PJ (empresa patrocinando funcionário) | Contratante com CNPJ, NFS-e contra a PJ, aprovador da empresa como papel de leitura |
| C8 | Cliente recorrente (2ª viagem) | Reuso de cadastro e documentos válidos do cofre (passaporte aprovado não se reenvia), histórico e código de indicação preservados |
| C9 | Cliente indicado | Campo de código no checkout, vínculo `Indicado_Por`, crédito ao indicador na quitação |
| C10 | Estudante que vira maior de idade durante o processo | Regra de idade avaliada na data de cada ato (contrato: idade na assinatura; CTV: idade no embarque), nunca congelada no cadastro |

Papéis por caso: **Contratante** (tudo, incluindo financeiro e repactuação), **Estudante** (jornada, checklist, documentos, sem financeiro por padrão, configurável), **Observador** (leitura: segundo responsável, RH da PJ), **Líder de grupo** (C6). Um login por pessoa; convites emitidos pelo contratante; notificações roteadas por papel (parcela → contratante; certificado → estudante; embarque → todos).

---

## 3. Máquina de estados principal (a linha da jornada)

| # | Estado | Entra por | Sai por |
|---|---|---|---|
| 0 | Proposta enviada | Consultor gera link | `payment.approved` OU expiração |
| 1 | Entrada paga | Webhook MP | Cadastro completo |
| 2 | Contrato | Cadastro completo | Webhook Sign (todos assinaram) |
| 3 | Matrícula | Contrato assinado | Webhook SignForms (ficha) |
| 4 | Documentação | Ficha assinada e enviada à escola | Docs obrigatórios aprovados + LOA recebida |
| 5 | Visto | Docs + LOA | `Visto_Status = Aprovado` |
| 6 | Pré-embarque | Visto aprovado | Data de embarque (relógio) |
| 7 | Em programa | Embarque | Data de retorno (relógio) |
| 8 | Retorno | Retorno | Sequência de retorno concluída |
| T1 | **Concluído** | Fim da sequência de retorno | terminal (alimenta esteira de longo prazo) |
| T2 | **Cancelado** (subtipo: arrependimento, cliente, inadimplência, escola, visto, força maior) | Processo de cancelamento concluído | terminal |
| T3 | **Expirado** | Proposta vencida sem pagamento | terminal (retrabalhável pelo consultor) |

Programas sem visto (destinos isentos) pulam o estado 5 automaticamente pela regra do destino; o motor de checklist absorve a diferença.

---

## 4. Processos de exceção (o que torna a plataforma à prova de mundo real)

Padrão arquitetural: uma exceção **não é um estado da linha principal**; é um processo paralelo com máquina própria que, ao abrir, pode **suspender** partes do motor (cobrança, lembretes, avanço) e, ao fechar, **retoma, redireciona ou encerra** a jornada. Campo `Processo_Ativo` no caso; o portal sempre mostra ao cliente em que processo está e de quem é a bola.

### E1. Visto negado
`Visto_Status = Negado` → **automático e imediato**: pausa régua de cobrança e lembretes; notifica cliente com empatia e próximos passos; abre tarefa prioritária ao consultor (contato em 24h). **Caminhos**: reaplicação (retoma estado 5 com novo checklist consular), troca de destino (processo E3 de alteração, aproveitando tudo já pago), ou cancelamento por visto (motor de acerto: consulta `Fornecedor_Politica_Visa_Refusal` do cadastro do fornecedor, dispara pedido de refund à escola pelo portal do fornecedor, calcula devolução ao cliente na moeda, gera acerto com memória de cálculo e aceite eletrônico). Metade dos vistos negados é recuperável como venda; o fluxo existe para isso.

### E2. Adiamento de início (deferral)
Solicitado pelo portal ("alterar datas") → consulta à escola via portal do fornecedor (pendência com SLA) → aprovado: recálculo em cascata **numa transação**: novas datas → Anexo I atualizado → marcos 1 e 2 recalculados → cronograma revalidado (se violar marco novo, editor abre pré-carregado) → aditivo eletrônico (mesmo mecanismo da repactuação) → checklist e régua realinhados → escola e cliente notificados. Negado pela escola: alternativas ou mantém datas.

### E3. Alteração de escopo (extensão, upgrade, troca de escola/cidade, serviços adicionais)
Mesmo esqueleto do E2: solicitação → confirmação do fornecedor (quando aplicável) → delta financeiro calculado na moeda (a extensão gera cobrança complementar pelo próprio mecanismo de checkout, reaproveitado como "aditivo de compra") → aceite → cascata. Extensão in-country é ofertada proativamente pelo check-in D-30 do fim (seção 6) e é das receitas de melhor margem do setor.

### E4. Cancelamento pelo cliente
**Até 7 dias da entrada (arrependimento, CDC art. 49)**: botão no portal → confirmação → refund integral automático via API MP → contrato/Sign cancelado → escola avisada se ficha já enviada → T2 em minutos, sem humano. **Após 7 dias**: solicitação abre o motor de acerto: retenção/multa conforme cláusula e momento da jornada, valores já remetidos à escola e refund esperado dela (política por fornecedor), saldo a devolver com memória de cálculo → proposta de acerto no portal → aceite eletrônico → execução → T2. Ponto humano: uma conversa de retenção antes do acerto (tarefa automática), porque parte dos cancelamentos é dúvida, não decisão.

### E5. Cancelamento por inadimplência
D+10 já abre tarefa humana (v3). O desfecho agora existe: sem acordo até D+30 do vencimento → notificação formal de rescisão com prazo de cura (ex.: 10 dias) → vencido, motor de acerto com as retenções contratuais, liberação da vaga junto à escola, T2. Cada passo notificado; nada rescinde em silêncio.

### E6. Cancelamento pela escola (turma não abriu, escola fechou)
Registrado pelo fornecedor no portal ou pelo time → **automático**: pausa cobrança; oferta de realocação (motor de alteração E3 com prioridade e sem custo ao cliente) ou reembolso integral incluindo a entrada. Falência de escola: acionamento do plano de contingência (realocação com fornecedores alternativos do catálogo); o risco reputacional é da instância, e velocidade de resposta é tudo.

### E7. Interrupção durante o programa
Retorno antecipado (saúde, família, insatisfação, expulsão por conduta, barrado na imigração): registrado como ocorrência crítica → suspende o que restar de cobrança para análise → acerto conforme causa (políticas de refund da escola, acionamento do seguro quando cabível, guiado pelo portal com os dados da apólice do cofre) → encerramento digno: a sequência de retorno roda em versão adaptada (sem convite a review público automático; NPS interno vira conversa humana).

### E8. Força maior coletiva (fronteira fechada, pandemia, desastre no destino)
Flag por destino/período acionada pelo gestor → aplica em lote a todos os casos afetados: pausa de cobrança, comunicação padronizada, e cada caso roteado para E2 (adiar) ou E4/E6 (cancelar) conforme escolha do cliente. Aprendizado de 2020: quem tinha isso em lote sobreviveu com a marca intacta; quem tratou caso a caso no WhatsApp, não.

### E9. Contestação de pagamento (MED PIX, chargeback futuro de cartão)
Webhook de disputa do MP → congela o efeito do pagamento contestado (parcela volta a "em disputa", jornada suspensa se material), tarefa urgente com o dossiê automático (aceites registrados, logs, contrato, entregas), resposta dentro do prazo do MED. Perdida a disputa, trata-se como inadimplência (E5) do valor.

### E10. Suspeita de fraude
Sinais (documento inconsistente na conferência automática, dados divergentes, padrão de pagamento anômalo) → flag que trava avanço para estados onerosos (remessa à escola, emissão de passagem) até verificação humana. Barato de construir agora como um simples `Hold_Verificacao`; caro de improvisar no primeiro incidente.

### E11. Cliente incontactável / pendência eterna
Pendência do cliente parada por 30 dias (configurável) mesmo após a cadência de lembretes → escalada a humano; 60 dias em estados pré-embarque críticos → tratativa formal (risco de perder janela de visto/vaga é do cliente, mas precisa estar comunicado e registrado).

---

## 5. Catálogo consolidado de eventos

| Origem | Eventos |
|---|---|
| Mercado Pago | `payment.approved` (entrada, parcela, aditivo), `payment.refunded`, `dispute.opened/closed` |
| Zoho Sign / SignForms | contrato assinado, ficha assinada, aditivos assinados |
| Portal (cliente) | upload de documento, repactuação solicitada/confirmada, antecipação, solicitação de alteração/cancelamento, checklist marcado, NPS respondido, convite de papel emitido/aceito, pedido LGPD |
| Portal (fornecedor) | acesso/visualização/download (log), upload tipado (LOA, fatura, docs visto, seguro), confirmação de disponibilidade/deferral, registro de cancelamento pela escola |
| Time (CRM) | aprovação/rejeição de doc, `Visto_Status`, decisão em exceções, override de prazos, flag força maior, resolução de detrator |
| Relógio | vencimentos e régua de cobrança, D-45/D-37/D-30 do fornecedor, embarque, retorno, check-ins D+3/D+30/meio/D-30 do fim, expiração de proposta e QR, marcos de esteira longa (D+45, 6m, 12m), timeouts de pendência (E11) |
| Sistema | conferência automática (aprovada/divergente), cotação diária BACEN, falha de webhook/fila (alerta ativo), NFS-e emitida, comissão apurada |

Todo evento: ID único, idempotente, logado, roteado a um handler que atualiza o CRM e enfileira notificações por papel.

---

## 6. Módulos (consolidação com as lacunas incorporadas)

- **Checkout próprio** (v3 §2.8): link por Deal, página server-side, Termo de Adesão com arrependimento CDC, QR PIX 24h, funil de fechamento. Reaproveitado para aditivos de compra (E3) e parcelas.
- **Financeiro**: dívida na moeda, editor de parcelas com Marcos 1 e 2, repactuação com aceite-aditivo (wireframes aprovados), régua de cobrança, **NFS-e automática por pagamento**, **motor de acerto** (cancelamentos/alterações, com memória de cálculo), **comissões internas apuradas por evento**, tesouraria com conversão contínua para conta multimoeda (ou travas) e exposição por moeda no cockpit. Cartão 12x na evolução, modelo de dados já preparado.
- **Documentos**: cofre com ciclo de aprovação, validade monitorada, conferência automática de uploads do fornecedor (cruzamento nome/datas/programa; humano só na divergência), reuso para cliente recorrente (C8).
- **Fornecedores**: portal com magic link e escopo por caso (fallback link seguro), ficha bilíngue auto-preenchida (3 fontes + só saúde/emergência/preferências manuais), régua de LOA com SLA, pagamento D-30 configurável com conferência de fatura, `Fornecedor_Politica_Visa_Refusal` e políticas de refund no cadastro, roster de grupos (C6), **catálogo de preços estruturado** (programas, temporadas, promoções com validade) como base da proposta e coração do marketplace Forio.
- **Checklist**: regras por destino/programa/idade/acomodação, destinos sem visto, CTV por idade no embarque (C10).
- **Notificações**: matriz evento × canal × **papel**, agrupamento diário, cessação automática, templates por fase e por exceção (tom de E1/E7 é outro produto).
- **Durante o programa**: contatos, endereços, **ticketing de ocorrências** (categoria, dono, SLA, histórico; sinistro de seguro guiado), check-ins D+3/D+30/meio/**D-30 do fim** (gatilho da extensão).
- **Retorno**: certificado → NPS (detrator pausa e vira humano) → Google review para todos → indicação → próxima viagem; **captação de depoimento/embaixador para NPS ≥ 9** (termo de imagem eletrônico); versão adaptada para E7.
- **Esteira de longo prazo**: nutrição por perfil 6–24 meses, aniversário de intercâmbio, reativação de indicação em picos sazonais.
- **Parceiros ancilares**: visto/aéreo/câmbio nos momentos certos, código de rastreio, consentimento específico, um parceiro por categoria com revisão semestral.
- **Cockpit**: funis (fechamento, operacional, fornecedores), filas do dia, tesouraria, exceções abertas por tipo e idade, saúde da automação com **alertas ativos** (falha acorda alguém), **RBAC interno** por papel do time.
- **Governança**: multiusuário por papéis (seção 2), versionamento de templates jurídicos com vigência, fluxo LGPD de direitos do titular com propagação a fornecedores, ambiente de homologação, backup/restore testado.

---

## 7. Roadmap consolidado

**Onda 1 — Vender e contratar sem mock**: checkout + Termo validado juridicamente, estados 0–3, barramento, financeiro BACEN real, **NFS-e**, **arrependimento 7 dias completo**, **modelo multiusuário no dado** (UI mínima), **E1 mínimo** (pausa de cobrança + política escrita de visto negado), versionamento de templates, e-mail transacional, funil de fechamento.

**Onda 2 — Operar a preparação**: estados 4–6, cofre completo, checklist, ficha auto-preenchida + envio ao fornecedor via link seguro, régua de LOA, WhatsApp oficial, pagamento de parcelas e editor com marcos, campos e alertas de pagamento a fornecedor, **E2 (deferral) e E4 pós-7-dias com motor de acerto**, papéis com UI de convite.

**Onda 3 — Fechar o ciclo**: portal do fornecedor completo com conferência automática, retorno completo + parceiros ancilares, **E3 (alterações/extensão) com aditivo de compra**, ticketing de ocorrências, **catálogo de preços**, E5/E6 formalizados, fluxo LGPD do titular.

**Onda 4 — Escalar com inteligência**: cockpit avançado (ranking de fornecedores, exposição cambial, comissões), cartão 12x, check-ins longos e extensão proativa, esteira de longo prazo e embaixadores, E8–E11 endurecidos, homologação e alertas ativos maduros, replicação da instância Forio com camada de vendedor.

---

## 8. Registro de decisões já tomadas

| Decisão | Escolha |
|---|---|
| Autonomia das empresas | Total nos dados; base de código única com dois deployments |
| Checkout | Próprio desde o MVP, PIX/QR Mercado Pago, webhook como gatilho-mestre |
| Aceite jurídico | Termo de Adesão no checkout + contrato Sign; repactuações e alterações por aceite eletrônico com valor de aditivo |
| Spread | 6,6% (parâmetro `Spread_Percentual` por instância), IOF 3,5%, BACEN Turismo Venda |
| Recebimento | Sempre em R$; tesouraria converte continuamente para conta multimoeda (ou trava forward) |
| Pagamento a escolas | Padrão D-30, configurável por fornecedor e caso; fatura conferida antes de pagar |
| Fornecedores | Portal restrito com magic link como padrão; link seguro expirável como fallback; nunca anexo |
| Conferência de uploads | Automática por cruzamento de dados; humano só na divergência |
| Marcos do parcelamento | Marco 1 = cobertura da escola (prazo − buffer); Marco 2 = quitação até o embarque |
| Google review | Convite a todos, pós-NPS interno, detrator resolvido antes; sem gating |
| Exceções | Processos paralelos que suspendem/retomam a linha principal; nunca estados improvisados |

**Pendências de decisão**: validação jurídica (Termo, cláusulas de repactuação/acerto, contratos de fornecedor com LGPD internacional e políticas de refund), escolha do emissor de NFS-e, escolha da solução de conta multimoeda/corretora B2B, e a regra de conflito de interesse EXP Tour × Forio antes do módulo "próxima viagem" no marketplace.
