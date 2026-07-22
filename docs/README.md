# Documentação — Portal EXP Tour

Índice dos documentos de arquitetura e planejamento do portal (Área do Cliente).

| Documento | O que é |
|---|---|
| [`plano-desenvolvimento-v2.md`](./plano-desenvolvimento-v2.md) | Plano de desenvolvimento v2, alinhado ao que já está em produção. Toma a decisão de arquitetura (Supabase como fonte de verdade, Zoho como camada comercial sincronizada), mapeia o que existe contra a arquitetura-mestre e reordena o backlog em blocos. **Documento de referência ativo.** |
| `arquitetura-mestre-v4.md` | _(pendente)_ A arquitetura-mestre v4 referenciada pelo plano v2 ainda não está no repositório. Quando disponível, colocá-la aqui com este nome, para que o plano e o CLAUDE.md apontem para ela. |

## Como trabalhar a partir daqui

O plano v2 é executado **um item numerado por vez**, com testes e commit a cada passo, na ordem dos blocos (Seção 3 do plano). O item 1 (webhook do Mercado Pago idempotente com tabela `events`) é o primeiro por ser pequeno, crítico e por validar o padrão de eventos que os demais itens vão reutilizar.

Estado do backlog:

- **Bloco 1, item 1 — Webhook MP idempotente:** implementado. Tabela `events` em `supabase/schema.sql`, validação de assinatura, ledger de idempotência, log de tentativas e reprocessamento manual via rotas admin.
- Demais itens: conforme o plano.
