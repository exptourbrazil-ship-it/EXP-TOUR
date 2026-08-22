import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Testes de ISOLAMENTO ENTRE TENANTS (spec-catalogo-preco-cotacao.md, Secao 10).
//
// A arquitetura do portal faz "toda autorizacao em codigo" (RLS habilitado SEM
// policies + service role): o banco NAO e rede de protecao. Logo, o isolamento
// entre tenants depende de TODA query/mutacao em tabela com `tenant_id` filtrar
// por tenant_id. Como os servicos usam o alias "@/" e dependencias nao-puras
// (nao importaveis sob `node --test`), este teste e um GUARDRAIL ESTATICO: le o
// texto-fonte e falha se alguma query em tabela tenant-scoped esquecer o escopo.
// Ele nao substitui um teste de integracao, mas pega a regressao mais comum
// (adicionar uma query sem tenant_id) sem rede/DB.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

// Tabelas tenant-scoped = aquelas cujo bloco CREATE em schema.sql contem
// `tenant_id`. Derivado do schema para o teste se manter sozinho quando novas
// tabelas surgirem.
function tenantScopedTables(schema: string): Set<string> {
  const set = new Set<string>();
  const re = /create table if not exists (\w+) \(([\s\S]*?)\n\);/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(schema))) {
    if (/\btenant_id\b/.test(m[2])) set.add(m[1]);
  }
  return set;
}

// Cada janela = de `.from("tabela")` ate o proximo `;` (fim do statement da query
// no supabase-js). Cobre selects, inserts (payload) e updates (payload + .eq).
function janelas(texto: string): { tabela: string; win: string }[] {
  const out: { tabela: string; win: string }[] = [];
  const re = /\.from\((["'])([a-z_]+)\1\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto))) {
    const ini = m.index;
    const pv = texto.indexOf(";", ini);
    out.push({ tabela: m[2], win: texto.slice(ini, pv === -1 ? texto.length : pv) });
  }
  return out;
}

// Marcadores que tornam uma janela SEGURA quanto ao isolamento:
//  - "tenant_id": filtro (.eq/.or/.match) ou insert/update explicito por tenant.
//  - "public_token": leitura publica chaveada pelo token opaco (a POSSE e o
//    token; o tenant vem da linha retornada). Excecao deliberada do portal.
//  - "...rest"/"...drest"/"...frest": insert por spread de uma linha JA lida com
//    filtro tenant_id no MESMO fluxo (copyOptionContents) — verificado na revisao
//    de seguranca; o tenant_id vem herdado do select de origem.
const MARCADORES_OK = ["tenant_id", "public_token", "...rest", "...drest", "...frest"];

const ARQUIVOS = [
  "src/lib/catalog-service.ts",
  "src/lib/quote-service.ts",
  "src/lib/quote-issue-service.ts",
  "src/lib/catalog-route.ts",
];

const SCHEMA = read("supabase/schema.sql");
const TENANT_TABLES = tenantScopedTables(SCHEMA);

test("schema: tabelas tenant-scoped sao detectadas corretamente", () => {
  assert.ok(
    TENANT_TABLES.size >= 15,
    `esperava >=15 tabelas com tenant_id, detectei ${TENANT_TABLES.size}`,
  );
  for (const t of ["quote", "quote_option", "quote_item", "quote_discount", "student", "product", "campus", "promotion", "fee"]) {
    assert.ok(TENANT_TABLES.has(t), `${t} deveria ser tenant-scoped`);
  }
  // Globais / junction / filhas (sem coluna tenant_id) NAO devem ser exigidas.
  for (const t of ["fx_rate", "admin_users", "tenant", "price_template_product", "price_tier", "package_item"]) {
    assert.ok(!TENANT_TABLES.has(t), `${t} NAO deveria ser tenant-scoped (query sem tenant_id e legitima)`);
  }
});

test("toda query em tabela tenant-scoped filtra por tenant_id", () => {
  let escaneadas = 0;
  const faltas: string[] = [];
  for (const arq of ARQUIVOS) {
    const texto = read(arq);
    for (const { tabela, win } of janelas(texto)) {
      if (!TENANT_TABLES.has(tabela)) continue; // tabela global/junction: ok
      escaneadas++;
      if (!MARCADORES_OK.some((mk) => win.includes(mk))) {
        faltas.push(`${arq}: .from("${tabela}") sem escopo -> ${win.slice(0, 140).replace(/\s+/g, " ")}`);
      }
    }
  }
  assert.ok(escaneadas >= 30, `parsing suspeito: so ${escaneadas} queries tenant-scoped vistas`);
  assert.deepEqual(
    faltas,
    [],
    `Queries em tabela tenant-scoped SEM filtro de tenant (vazamento entre tenants):\n${faltas.join("\n")}`,
  );
});

test("portal publico: getPublicQuote expoe do estudante APENAS o first_name", () => {
  const texto = read("src/lib/quote-issue-service.ts");
  const leiturasStudent = janelas(texto).filter((j) => j.tabela === "student");
  assert.ok(leiturasStudent.length >= 1, "esperava ao menos uma leitura de student");
  for (const { win } of leiturasStudent) {
    assert.ok(
      /\.select\("first_name"\)/.test(win),
      `leitura publica de student deveria selecionar so first_name: ${win.slice(0, 140)}`,
    );
    assert.ok(
      !/last_name|"email"|passport|phone|birth_date|residence_country/.test(win),
      `leitura publica de student NAO pode trazer PII alem do primeiro nome: ${win.slice(0, 180)}`,
    );
  }
});

test("portal publico: leitura por token nao usa .select(\"*\") em student/quote", () => {
  const texto = read("src/lib/quote-issue-service.ts");
  // Nenhuma leitura de student/quote no servico publico deve puxar a linha inteira.
  for (const { tabela, win } of janelas(texto)) {
    if (tabela === "student" || tabela === "quote") {
      assert.ok(
        !/\.select\("\*"\)/.test(win),
        `${tabela}: leitura no servico publico nao deve usar select("*"): ${win.slice(0, 140)}`,
      );
    }
  }
});
