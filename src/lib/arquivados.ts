// Regras PURAS da aba "Arquivados" do hub do fornecedor (listar e restaurar
// produto/taxa arquivados). Sem banco/UI — o servidor aplica estas decisões e a
// tela usa os mesmos textos.

// Máximo de linhas carregadas por bloco; acima disso a tela avisa "há mais".
export const LIMITE_POR_BLOCO = 200;
// Tamanho do lote para .in(...) (evita URL gigante no PostgREST).
export const TAMANHO_LOTE_IN = 50;

export const KINDS_PRODUTO = ["program", "accommodation", "other", "package", "insurance"] as const;
export const TIPOS_TAXA = [
  "registration", "material", "bank", "placement", "service", "courier", "courier_of_documents", "custom",
] as const;

export const ROTULO_KIND: Record<string, string> = {
  program: "Programa",
  accommodation: "Acomodação",
  other: "Outro",
  package: "Pacote",
  insurance: "Seguro",
};
export const ROTULO_TIPO_TAXA: Record<string, string> = {
  registration: "Matrícula",
  material: "Material",
  bank: "Bancária",
  placement: "Colocação",
  service: "Serviço",
  courier: "Courier",
  courier_of_documents: "Courier de documentos",
  custom: "Outra",
};

// Lista fechada: valor fora dela vira null (nunca vai para a query).
export function kindProdutoValido(v: string | null | undefined): string | null {
  return v && (KINDS_PRODUTO as readonly string[]).includes(v) ? v : null;
}
export function tipoTaxaValido(v: string | null | undefined): string | null {
  return v && (TIPOS_TAXA as readonly string[]).includes(v) ? v : null;
}

// Termo de busca seguro para ilike: apara, limita o tamanho e remove os
// caracteres que têm sentido no filtro do PostgREST/LIKE (%, _, vírgula,
// parênteses, aspas, barra invertida). Vazio => null.
export function normalizarBusca(v: string | null | undefined): string | null {
  if (!v) return null;
  const limpo = v.replace(/[%_,()"'\\*]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  return limpo.length > 0 ? limpo : null;
}

// Corta um bloco no limite e diz se havia mais (total vem da contagem exata).
export function limitarBloco<T>(
  itens: T[],
  total: number,
  limite = LIMITE_POR_BLOCO,
): { itens: T[]; total: number; haMais: boolean } {
  const cortados = itens.slice(0, limite);
  return { itens: cortados, total, haMais: total > cortados.length };
}

// Parte uma lista em lotes (para .in(...)).
export function emLotes<T>(itens: T[], tamanho = TAMANHO_LOTE_IN): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) out.push(itens.slice(i, i + tamanho));
  return out;
}

// "A, B, C e mais N" para os produtos ligados a uma tabela arquivada.
export function resumoProdutosLigados(nomes: string[], max = 3): string {
  const unicos = [...new Set(nomes)];
  if (unicos.length === 0) return "nenhum produto ligado";
  const lista = unicos.slice(0, max).join(", ");
  return unicos.length > max ? `${lista} e mais ${unicos.length - max}` : lista;
}

// Agrupa linhas de vínculo (tabela -> produto) em tabela -> nomes dos produtos.
export function nomesPorTabela(
  vinculos: Array<{ price_template_id: string; product_id: string }>,
  nomeDoProduto: Map<string, string>,
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const v of vinculos) {
    const nome = nomeDoProduto.get(v.product_id);
    if (!nome) continue; // produto de outro tenant/inexistente: nunca exibe
    out.set(v.price_template_id, [...(out.get(v.price_template_id) ?? []), nome]);
  }
  return out;
}

// ── Guardas de restauração ───────────────────────────────────────────────────

export type RecusaRestaurar = { codigo: "nao_arquivado" | "campus_arquivado" | "gerido" | "tabela_arquivada"; mensagem: string };

export function recusaRestaurarProduto(p: { arquivado: boolean; campusArquivado: boolean }): RecusaRestaurar | null {
  if (!p.arquivado) return { codigo: "nao_arquivado", mensagem: "O produto não está arquivado." };
  if (p.campusArquivado) {
    return {
      codigo: "campus_arquivado",
      mensagem: "O campus deste produto está arquivado. Restaure o campus antes de restaurar o produto.",
    };
  }
  return null;
}

// Taxa: mesmas guardas do fee-admin-service (campus vivo, taxa manual, tabela de
// origem viva). Taxa gerida por price list foi arquivada pelo supersede de um
// price list novo: restaurá-la reviveria um preço antigo.
export function recusaRestaurarTaxa(t: {
  arquivada: boolean;
  campusArquivado: boolean;
  gerida: boolean;
  tabelaOrigemArquivada: boolean;
}): RecusaRestaurar | null {
  if (!t.arquivada) return { codigo: "nao_arquivado", mensagem: "A taxa não está arquivada." };
  if (t.campusArquivado) {
    return { codigo: "campus_arquivado", mensagem: "O campus desta taxa está arquivado. Restaure o campus antes." };
  }
  if (t.gerida) {
    return {
      codigo: "gerido",
      mensagem: "Esta taxa veio de um price list e foi substituída por um mais novo; não pode ser restaurada. Crie uma nova taxa.",
    };
  }
  if (t.tabelaOrigemArquivada) {
    return {
      codigo: "tabela_arquivada",
      mensagem: "O valor desta taxa deriva de uma tabela de preço arquivada. Crie uma nova taxa com valor fixo ou com uma tabela vigente.",
    };
  }
  return null;
}

// Aviso mostrado na confirmação de restaurar produto: o status NÃO muda.
export function avisoRestaurarProduto(status: string): string {
  const rot = status === "inactive" ? "inativo" : status === "active" ? "ativo" : status;
  return `O produto volta com o status que tinha (${rot}) — restaurar não o torna ativo nem visível. Ajuste no editor, se for o caso.`;
}
