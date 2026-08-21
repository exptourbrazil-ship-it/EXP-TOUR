# Decisões de arquitetura (ADRs)

Registro curto de decisões que resolvem ambiguidade. Formato: contexto, decisão,
consequência. A mais recente no topo.

---

## ADR-001 — Encaixe da spec de Catálogo/Preço/Cotação (Edvisor) no portal atual

**Data:** 2026-08-21

**Contexto.** Chegou a spec `Forio — Catálogo, Preço e Cotação` (derivada do
Edvisor), a ser adicionada como `docs/spec-catalogo-preco-cotacao.md`. Ela traz
convenções próprias que **divergem** do portal em produção:

| Tema | Spec | Portal atual |
|---|---|---|
| Idioma do código | inglês | português (`titulares`, `parcelas`…) |
| Autorização | RLS por políticas + `tenant_id` + Supabase Auth | RLS habilitado sem policies + auth em código + service role |
| Tenancy | multi-tenant (`tenant_id` em tudo, `membership`) | single-tenant (EXP Tour; Forio como instância futura) |
| Sessão | Supabase Auth (senha + magic link) | sessão HMAC em cookie (CPF+código / código admin) |

**Decisão.** Construir o módulo **no mesmo repositório, adaptando às convenções
vigentes** do portal:

- **Autorização em código + service role nas rotas**, RLS habilitado sem policies
  (como as demais tabelas). **Não** introduzir Supabase Auth nem RLS por políticas.
- **Single-tenant hoje**, mas toda tabela nova nasce com `tenant_id uuid` (default
  do tenant atual) para o multi-tenant futuro não exigir reescrita.
- **Identificadores/tabelas/colunas/enums em inglês** (como a spec pede na seção 0);
  comentários, mensagens de erro e conteúdo ao usuário em **português**.
- Câmbio congelado na emissão e `product_snapshot` mantidos como na spec.

**Consequência.** Um único paradigma de auth/segurança no repositório (menos risco,
consistência com a auditoria de segurança já feita). O custo é divergir da spec em
auth/tenancy/RLS — mitigado por: (a) manter a coluna `tenant_id` desde já; (b) a
lógica de RLS por papel continua existindo, só que aplicada em código
(`admin-roles`/guardas) em vez de políticas do Postgres. Se um dia o produto virar
plataforma multi-tenant de verdade com autogestão de fornecedor, revisitar esta
decisão (as políticas de RLS da spec seriam reintroduzidas então).

**Não afeta** o motor de preço (`lib/pricing`): é função pura, agnóstica a
auth/tenancy, e pode ser construído primeiro (tests-first, casos T1–T8).
