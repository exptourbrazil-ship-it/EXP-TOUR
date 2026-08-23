# Documentação — Portal EXP Tour

Índice dos documentos de arquitetura e planejamento do portal (Área do Cliente).

| Documento | O que é |
|---|---|
| [`estado-do-portal.md`](./estado-do-portal.md) | **Comece por aqui.** Arquitetura como construída: o que existe em produção hoje, fluxos críticos (pagamento, autenticação, documentos, cancelamento), postura de segurança pós-auditoria OWASP, jobs agendados, variáveis obrigatórias, o que falta e os incidentes com as lições. |
| [`plano-desenvolvimento-v2.md`](./plano-desenvolvimento-v2.md) | Plano de desenvolvimento v2, alinhado ao que já está em produção. Toma a decisão de arquitetura (Supabase como fonte de verdade, Zoho como camada comercial sincronizada), mapeia o que existe contra a arquitetura-mestre e reordena o backlog em blocos. **Documento de referência ativo.** |
| [`plano-migracao-next.md`](./plano-migracao-next.md) | Plano de migração do Next.js 14 → 16 em duas fases (14→15 com APIs de request assíncronas + React 19; 15→16 com Node 20+ e Turbopack). Mapeia os pontos exatos do código a ajustar. |
| [`contrato-arquitetura.md`](./contrato-arquitetura.md) | Análise do Contrato de Prestação de Serviços × arquitetura da Área do Cliente: mapa cláusula → estado atual → ajuste. Decisões de câmbio, Saldo Devedor, aceite/assinatura e Zoho Sign. |
| [`plano-zoho-sign.md`](./plano-zoho-sign.md) | Plano do Zoho Sign (Bloco 3): assinatura da Ficha de matrícula via barramento de eventos + cópia de documentos no CRM. Passos feitos e o que falta para ativar. |
| [`sessao-area-cliente.md`](./sessao-area-cliente.md) | Registro da 1ª sessão (parcelas, UX, responsivo, logo, documentos). |
| [`sessao-area-cliente-2.md`](./sessao-area-cliente-2.md) | Registro da 2ª sessão (contrato, financeiro, Zoho, aceite, réguas, antecipação, Anexo III, UX). |
| [`aplicacao-excecoes.md`](./aplicacao-excecoes.md) | Registro de aplicação do módulo de processos de exceção (E1–E11) + Motor de Acerto (Fatia 1) + Motor de Alteração E2/E3 (prévia → execução em cascata → notificação → crédito do E3 em acerto): ordem dos patches, DDL, config/crons, verificação, cobertura e pendências. |

## Handoff de arquitetura (visão-alvo — Cliente + Admin + Fornecedor)

Pacote consolidado da sessão de arquitetura (21/08/2026). Descreve o **destino** do
produto (não o estado atual — para isso, `estado-do-portal.md`). Onde houver
conflito com a realidade implementada, valem `estado-do-portal.md` e
`plano-desenvolvimento-v2.md` (em especial: **Supabase é a fonte de verdade**, não o CRM).

| Documento | O que é |
|---|---|
| [`00-LEIA-PRIMEIRO.md`](./00-LEIA-PRIMEIRO.md) | **Entrada do handoff.** Ordem de leitura, adendo Leads/Clientes, mockups aprovados, ordem de execução por blocos, padrões obrigatórios. |
| [`01-arquitetura-mestre-v4.md`](./01-arquitetura-mestre-v4.md) | Visão completa: princípios, cenários de cliente (C1–C10), máquina de estados, exceções (E1–E11), catálogo de eventos. _(traz nota de reconciliação: Supabase, não CRM, é a fonte de verdade.)_ |
| [`03-motor-area-do-cliente-v3.md`](./03-motor-area-do-cliente-v3.md) | Checkout próprio, Termo de Adesão, fluxo Mercado Pago, réguas. |
| [`04-motor-financeiro-parcelamento.md`](./04-motor-financeiro-parcelamento.md) | Dívida na moeda do programa, editor de parcelas (Marcos 1 e 2), repactuação com aceite-aditivo, tesouraria cambial. |
| [`05-modulo-fornecedores-v2.md`](./05-modulo-fornecedores-v2.md) | Conferência de uploads, pagamento a escolas (D-30 configurável), ficha de matrícula bilíngue. |
| [`06-portal-fornecedor-especificacao-funcional.md`](./06-portal-fornecedor-especificacao-funcional.md) | Portal do fornecedor: login por código, matriz de alertas, materiais, catálogo, disponibilidade, modelo de dados. |
| [`07-arquitetura-area-administrativa.md`](./07-arquitetura-area-administrativa.md) | Admin: Fila do Dia, RBAC (4 papéis), Caso 360, padrão de mutação com audit. |
| [`08-arquitetura-experiencia-area-cliente.md`](./08-arquitetura-experiencia-area-cliente.md) | UX da Área do Cliente: princípios, navegação (5 abas), serviços integrados, linguagem visual. |
| [`09-auditoria-lacunas-automacao.md`](./09-auditoria-lacunas-automacao.md) | Raciocínio por trás das exceções e prioridades (contexto). |
| [`10-briefing-contador-tributarista.md`](./10-briefing-contador-tributarista.md) | Contexto do handler de NFS-e (não é tarefa de código; fica pronto e desligado até o contador devolver parâmetros). |

## Como trabalhar a partir daqui

O plano v2 é executado **um item numerado por vez**, com testes e commit a cada passo, na ordem dos blocos (Seção 3 do plano). O item 1 (webhook do Mercado Pago idempotente com tabela `events`) é o primeiro por ser pequeno, crítico e por validar o padrão de eventos que os demais itens vão reutilizar.

Estado do backlog — o retrato completo e atualizado está em
[`estado-do-portal.md`](./estado-do-portal.md). Resumo:

- **Bloco 1, item 1 — Webhook MP idempotente:** entregue, e depois endurecido
  (`notification_url` por cobrança, rejeição de assinatura visível, cron de
  conciliação como rede de segurança) após o incidente de agosto/2026.
- **Bloco 1, item 3 — Régua de cobrança:** entregue (cron diário, lembretes de
  parcela e de quitação), e ciente de contratos cancelados.
- **Bloco 4, item 8 — Embarque, Viagem e Retorno:** entregue.
- **Segurança:** auditoria OWASP Top 10 completa em 14/08/2026, com os 3
  críticos e os altos corrigidos. Pendências em `estado-do-portal.md`, seção 8.
- **Cancelamento de contrato:** entregue (soft, com data efetiva retroativa e
  régua respeitando o estado).
- **Bloco 1, item 2 (infra: Vercel Pro, backups) e itens 9–10:** abertos.
