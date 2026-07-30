# Documentação — Portal EXP Tour

Índice dos documentos de arquitetura e planejamento do portal (Área do Cliente).

| Documento | O que é |
|---|---|
| [`plano-desenvolvimento-v2.md`](./plano-desenvolvimento-v2.md) | Plano de desenvolvimento v2, alinhado ao que já está em produção. Toma a decisão de arquitetura (Supabase como fonte de verdade, Zoho como camada comercial sincronizada), mapeia o que existe contra a arquitetura-mestre e reordena o backlog em blocos. **Documento de referência ativo.** |
| [`plano-migracao-next.md`](./plano-migracao-next.md) | Plano de migração do Next.js 14 → 16 em duas fases (14→15 com APIs de request assíncronas + React 19; 15→16 com Node 20+ e Turbopack). Mapeia os pontos exatos do código a ajustar. |
| [`contrato-arquitetura.md`](./contrato-arquitetura.md) | Análise do Contrato de Prestação de Serviços × arquitetura da Área do Cliente: mapa cláusula → estado atual → ajuste. Decisões de câmbio, Saldo Devedor, aceite/assinatura e Zoho Sign. |
| [`plano-zoho-sign.md`](./plano-zoho-sign.md) | Plano do Zoho Sign (Bloco 3): assinatura da Ficha de matrícula via barramento de eventos + cópia de documentos no CRM. Passos feitos e o que falta para ativar. |
| [`sessao-area-cliente.md`](./sessao-area-cliente.md) | Registro da 1ª sessão (parcelas, UX, responsivo, logo, documentos). |
| [`sessao-area-cliente-2.md`](./sessao-area-cliente-2.md) | Registro da 2ª sessão (contrato, financeiro, Zoho, aceite, réguas, antecipação, Anexo III, UX). **Handoff mais recente — comece por aqui.** |
| `arquitetura-mestre-v4.md` | _(pendente)_ A arquitetura-mestre v4 referenciada pelo plano v2 ainda não está no repositório. Quando disponível, colocá-la aqui com este nome, para que o plano e o CLAUDE.md apontem para ela. |

## Como trabalhar a partir daqui

O plano v2 é executado **um item numerado por vez**, com testes e commit a cada passo, na ordem dos blocos (Seção 3 do plano). O item 1 (webhook do Mercado Pago idempotente com tabela `events`) é o primeiro por ser pequeno, crítico e por validar o padrão de eventos que os demais itens vão reutilizar.

Estado do backlog:

- **Bloco 1, item 1 — Webhook MP idempotente:** implementado. Tabela `events` em `supabase/schema.sql`, validação de assinatura, ledger de idempotência, log de tentativas e reprocessamento manual via rotas admin.
- Demais itens: conforme o plano.
