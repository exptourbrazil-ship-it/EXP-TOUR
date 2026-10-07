// Regras PURAS do arquivamento (soft-delete) de produto, tabela de preço e taxa
// no hub do fornecedor — sem banco/UI, para serem testadas sem mocks. O
// servidor aplica estas decisões; a UI usa os mesmos textos na confirmação.

// Teto de produtos arquivados por chamada em lote (segurança contra acidente).
export const LIMITE_ARQUIVAR_LOTE = 200;

export type ProdutoParaLote = {
  id: string;
  kind: string;
  name: string;
  status: string;
  campusName?: string | null;
};

// Escolhe os produtos INATIVOS (e só eles) de uma lista, opcionalmente de um
// tipo. Pacotes vêm primeiro: se um pacote inativo e seus itens inativos forem
// arquivados juntos, o pacote sai antes e não bloqueia o arquivamento dos itens.
export function selecionarInativos<T extends ProdutoParaLote>(produtos: T[], kind?: string | null): T[] {
  const alvo = produtos.filter((p) => p.status === "inactive" && (!kind || p.kind === kind));
  return [...alvo].sort((a, b) => Number(b.kind === "package") - Number(a.kind === "package"));
}

// Texto de bloqueio: produto é item de pacote(s) ainda ativo(s) no catálogo.
export function mensagemBloqueioPacotes(produtoNome: string, pacotes: string[]): string {
  const unicos = [...new Set(pacotes)];
  const lista = unicos.slice(0, 5).join(", ") + (unicos.length > 5 ? ` e mais ${unicos.length - 5}` : "");
  return (
    `"${produtoNome}" não pode ser arquivado: é item de ${unicos.length === 1 ? "um pacote" : `${unicos.length} pacotes`} ` +
    `em uso (${lista}). Remova o item do pacote ou arquive o pacote antes.`
  );
}

// Resumo (nomes + campus) para a confirmação do lote: mostra as 5 primeiras.
export function resumoDoLote(itens: Array<{ name: string; campusName?: string | null }>, max = 5): string[] {
  const linhas = itens.slice(0, max).map((i) => (i.campusName ? `${i.name} — ${i.campusName}` : i.name));
  if (itens.length > max) linhas.push(`… e mais ${itens.length - max}`);
  return linhas;
}

// Quais pacotes bloqueiam o arquivamento de cada item. `vinculos` = linhas de
// package_item (item -> pacote); `pacotesVivos` = pacotes NÃO arquivados.
export function pacotesBloqueantes(
  itemIds: string[],
  vinculos: Array<{ item_product_id: string; package_product_id: string }>,
  pacotesVivos: Map<string, string>, // id do pacote -> nome
  ignorarPacoteIds: Set<string> = new Set(),
): Map<string, string[]> {
  const alvo = new Set(itemIds);
  const out = new Map<string, string[]>();
  for (const v of vinculos) {
    if (!alvo.has(v.item_product_id)) continue;
    if (ignorarPacoteIds.has(v.package_product_id)) continue;
    const nome = pacotesVivos.get(v.package_product_id);
    if (!nome) continue; // pacote arquivado/inexistente não bloqueia
    out.set(v.item_product_id, [...(out.get(v.item_product_id) ?? []), nome]);
  }
  return out;
}

// ── Tabela de preço ──────────────────────────────────────────────────────────

export type TabelaVigencia = {
  id: string;
  status: string;
  valid_from: string; // YYYY-MM-DD
  valid_until: string | null;
};

// Tabela ativa e dentro da vigência na data `hoje` (YYYY-MM-DD).
export function tabelaVigente(t: TabelaVigencia, hoje: string): boolean {
  return t.status === "active" && t.valid_from <= hoje && (t.valid_until == null || t.valid_until >= hoje);
}

// Produtos ATIVOS que ficariam sem nenhuma tabela vigente se `tabelaId` fosse
// arquivada. `tabelasPorProduto`: produto -> tabelas ligadas a ele (inclui a que
// será arquivada). Só informativo (não bloqueia).
export function produtosSemTabelaAposArquivar(
  tabelaId: string,
  produtos: Array<{ id: string; name: string; status: string }>,
  tabelasPorProduto: Map<string, TabelaVigencia[]>,
  hoje: string,
): string[] {
  const nomes: string[] = [];
  for (const p of produtos) {
    if (p.status !== "active") continue;
    const outras = (tabelasPorProduto.get(p.id) ?? []).filter((t) => t.id !== tabelaId);
    if (!outras.some((t) => tabelaVigente(t, hoje))) nomes.push(p.name);
  }
  return nomes;
}

// ── Lote ─────────────────────────────────────────────────────────────────────

export const MOTIVO_REATIVADO = "Produto foi reativado (não está mais inativo); não arquivado.";

// No lote só se arquiva produto que continua INATIVO. Devolve o motivo de
// recusa ou null. Protege contra reativação entre a listagem e o arquivamento.
export function motivoRecusaLote(status: string): string | null {
  return status === "inactive" ? null : MOTIVO_REATIVADO;
}

// Executa o lote na ordem recebida (pacotes primeiro). `arquivar` recebe o set
// de pacotes EFETIVAMENTE arquivados até ali (só esses deixam de bloquear seus
// itens) e lança Error(motivo) em caso de recusa. Pacote que falhou continua
// bloqueando os itens, que caem em `ignorados`.
export async function executarLote<T extends { id: string; kind: string; name: string }>(
  lote: T[],
  arquivar: (p: T, pacotesArquivados: Set<string>) => Promise<void>,
  motivoDe: (e: unknown) => string,
): Promise<{ arquivadosIds: string[]; ignorados: Array<{ id: string; nome: string; motivo: string }> }> {
  const pacotesArquivados = new Set<string>();
  const arquivadosIds: string[] = [];
  const ignorados: Array<{ id: string; nome: string; motivo: string }> = [];
  for (const p of lote) {
    try {
      await arquivar(p, pacotesArquivados);
      arquivadosIds.push(p.id);
      if (p.kind === "package") pacotesArquivados.add(p.id);
    } catch (e) {
      ignorados.push({ id: p.id, nome: p.name, motivo: motivoDe(e) });
    }
  }
  return { arquivadosIds, ignorados };
}

// ── Tabela expirada se arquiva sozinha ───────────────────────────────────────

// Espelho PURO do trigger `price_template_arquivar_expirada` (supabase/
// migracao-arquivar-tabela-expirada.sql): dado o estado antigo (null no INSERT)
// e o novo, devolve o archived_at que o banco gravará. Existe para documentar e
// testar a regra, já que não há banco de teste.
export function archivedAtAposTrigger(
  antigo: { status: string; archivedAt: string | null } | null,
  novo: { status: string; archivedAt: string | null },
  agora: string,
): string | null {
  if (novo.status === "expired" && novo.archivedAt == null) return agora;
  if (
    antigo &&
    antigo.status === "expired" &&
    novo.status !== "expired" &&
    novo.archivedAt != null &&
    novo.archivedAt === antigo.archivedAt
  ) {
    return null;
  }
  return novo.archivedAt;
}
