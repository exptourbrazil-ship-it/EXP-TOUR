# Plano de migração — Next.js 14 → 16

Plano para atualizar o portal do **Next.js 14.2.35** para a linha **16.x** (mais
recente). Motivação: a linha 14.x deixou de receber correções para uma série de
advisories de segurança do Next; a única correção oferecida pelo `npm audit` é o
salto para o major mais recente. A vulnerabilidade **crítica** de bypass de
autorização no middleware (CVE-2025-29927) já foi resolvida com o upgrade para
`14.2.35`, então **não há pressão de segurança** para correr — esta migração
pode ser feita com calma e validação por fase.

## 1. Estratégia: duas fases

O salto direto 14 → 16 acumula dois conjuntos de breaking changes ao mesmo
tempo. Fazemos **duas fases, com commit e deploy de preview validado entre
elas**, seguindo a regra do projeto de "um item por vez".

- **Fase 1 — 14.2.35 → 15.x**: concentra ~95% do trabalho de código (APIs de
  request assíncronas + React 19).
- **Fase 2 — 15.x → 16.x**: majoritariamente infra (Node 20+, Turbopack como
  padrão), pouco código.

## 2. Pré-requisitos

- **Node**: Next 15 exige Node ≥ 18.18; Next 16 exige **Node ≥ 20.9**. Hoje não
  há `.nvmrc` nem `engines` no `package.json` nem workflow de CI. Ação: fixar a
  versão do Node (`.nvmrc` com `20`, `"engines": { "node": ">=20.9" }`) e
  conferir no painel da Vercel se o runtime do projeto está em Node 20.
- Migrar **no branch de desenvolvimento vigente**, em cima do commit de
  segurança (`14.2.35`) já feito.
- Cada fase é um commit isolado → rollback via `git revert`.

## 3. Fase 1 — Next 15 + React 19

### 3.1 Bump de versões (`package.json`)

- `next`: `14.2.35` → `15.x` (última)
- `react` / `react-dom`: `^18.3.1` → `^19`
- `@types/react` / `@types/react-dom`: `^18` → `^19`
- Ponto de partida com os codemods oficiais:
  `npx @next/codemod@latest upgrade latest` e depois
  `npx @next/codemod@latest next-async-request-api .`

### 3.2 APIs de request assíncronas (item central)

No Next 15 `cookies()`/`headers()` passam a retornar `Promise`. **11 pontos**
usam `cookies()`:

**Páginas server (3):** `src/app/inicio/page.tsx`, `src/app/documentos/page.tsx`,
`src/app/parcelas/page.tsx` → `const cookieStore = await cookies()` (as funções
já são `async`, basta adicionar `await`).

**Rotas de API (6):** `api/documentos/[id]/download`, `api/documentos/upload`,
`api/parcelas/restaurar`, `api/parcelas/[id]/cancelar-cobranca`,
`api/parcelas/[id]/gerar-cobranca`, `api/parcelas/ajustar` → mesmo ajuste.

**`src/lib/admin-guard.ts` (2 pontos, com efeito cascata):** as duas funções
chamam `cookies()` de forma síncrona e precisam virar `async`:

- `exigirAdmin()` → `async` retornando `Promise<{ usuario: string }>`, com
  `const token = (await cookies()).get(...)`.
  - Caller: `src/app/admin/data-inicio/page.tsx` → `await exigirAdmin(...)`.
- `checarAdminCookie()` → `async` retornando `Promise<boolean>`.
  - Callers (3): `api/admin/events`, `api/admin/events/reprocessar`,
    `api/admin/data-inicio` → `if (await checarAdminCookie())`.

### 3.3 `params` assíncrono em rotas dinâmicas (3 arquivos)

`api/documentos/[id]/download`, `api/parcelas/[id]/cancelar-cobranca`,
`api/parcelas/[id]/gerar-cobranca`:

- Assinatura: `{ params }: { params: { id: string } }` →
  `{ params }: { params: Promise<{ id: string }> }`.
- Uso: `const { id } = await params;` e substituir `params.id` por `id`.

### 3.4 Mudança de caching (verificar, risco baixo)

No Next 15 `fetch()` deixa de ser cacheado por padrão e GET Route Handlers
deixam de ser estáticos. Os `fetch` do projeto (`lib/mercadopago.ts`,
`lib/email.ts`, `lib/zoho.ts`, `lib/whatsapp.ts`, `api/test-pix-sandbox`,
`api/cron/atualizar-cambio`) são todos para APIs externas dinâmicas — o novo
padrão "sem cache" é o comportamento desejado. Ação: revisar o cron de câmbio
para confirmar que nada dependia de cache implícito.

### 3.5 React 19 (risco baixo)

Superfície de componentes pequena, sem uso de `next/image`/`next/font` nem de
APIs removidas óbvias. Validar via `npm run build` (checagem de tipos com
`@types/react@19`) e teste manual das telas.

### 3.6 Validação da Fase 1

`npm install` → `npm test` (13/13) → `npm run build` → `npm run dev` + teste
manual dos fluxos críticos: login cliente (CPF + código), login admin, parcelas
(gerar/cancelar cobrança, ajustar, restaurar), documentos (upload/download),
painel de eventos. Confirmar `npm audit` sem as advisories de "high". Commit.

## 4. Fase 2 — Next 16

- Bump `next` → `16.x`; rodar `npx @next/codemod@latest upgrade latest`.
- Garantir **Node 20.9+** (Seção 2) — requisito rígido do 16.
- **Turbopack** vira padrão. Rodar `npm run dev` e `npm run build` observando
  diffs de comportamento; se houver incompatibilidade pontual, manter Webpack no
  build enquanto se investiga.
- Revisar o changelog do 16 para remoções de config legada (o `next.config.js`
  atual é mínimo — só `reactStrictMode` —, exposição baixa).
- Validação idêntica à 3.6 + commit.

## 5. Riscos e rollback

- **Risco maior**: comportamento assíncrono de `cookies()` mal propagado →
  sessão/admin quebrando. Mitigado pelo build tipado (TS acusa `Promise` não
  aguardada) + teste manual dos logins.
- **Rollback**: cada fase é um commit isolado (`git revert`). O `14.2.35`
  permanece como base segura e sem a CVE crítica.
- Deploy de preview na Vercel por fase antes de promover para produção.

## 6. Esforço estimado

- Fase 1: pequena/média (edições mecânicas em ~14 arquivos + validação). O grosso
  é a validação manual dos fluxos, não o código.
- Fase 2: pequena (infra + smoke test), salvo surpresa do Turbopack.
