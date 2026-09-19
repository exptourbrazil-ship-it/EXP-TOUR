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

---

## ADR — Ajuste sazonal de acomodação: linha separada e base de promoções (2026-09-19)

**Contexto.** As escolas publicam ajustes por temporada na acomodação, por semana
("alta temporada 14/jun a 23/ago: +EUR 40/semana"; "baixa 3/jan a 28/fev: −EUR
30/semana"; "26/jun a 30/ago/2026: +EUR 115/semana"). O motor puro
(`src/lib/pricing.ts`) precisava decidir (a) onde o ajuste aparece na cotação e
(b) se ele entra na base de cálculo das promoções (`PromoBases`).

**Decisão.**
1. O ajuste sai como **linha separada** (`PricedItem.seasonal: SeasonalLine[]`),
   nunca embutido no valor da acomodação, e entra no `netAmount` pela soma
   **algébrica** (suplemento aumenta, baixa temporada reduz).
2. O ajuste **compõe o valor da acomodação antes das promoções**: entra em
   `bases.accommodation` e em `bases.total`, e **nunca** em `bases.tuition`
   (que é curso). Promoção sobre acomodação incide sobre o valor com temporada;
   promoção sobre curso ignora a temporada.
3. Períodos **sem ano são recorrentes** (todas as ocorrências que tocam a
   estadia, inclusive mais de uma na mesma estadia); **com ano** valem só naquele
   ano. Se só uma das pontas trouxer ano, o período é fixo e o ano que falta é
   inferido da outra ponta (+1 quando cruza a virada do ano).
4. Dia fora do mês é **limitado ao último dia** (29/fev em ano não bissexto vira
   28/fev), em vez de erro.
5. `full_week` cobra a semana inteira por bloco de 7 noites contado **a partir da
   data de início da estadia** (não por semana de calendário).

**Consequência.** O orçamento mostra "por que deu este número" sem precisar
desmontar o preço da acomodação, e o rastro fica em `price_breakdown.seasonal`.
O limite conhecido é que hoje `priceProduct` precifica **um item por vez** e
coloca o bruto do item em `bases.tuition` mesmo quando o produto é acomodação —
por isso `bases.accommodation` carrega só o sazonal. Quando a cotação passar a
consolidar vários itens por tipo, `bases.accommodation` deve receber o bruto da
acomodação **mais** o sazonal, e esta ADR deve ser revisitada.
