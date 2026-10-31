// Normaliza o termo digitado na busca de titular por nome. PURO (testavel).
// Devolve null quando curto demais (evita varrer a base inteira). Remove os
// curingas do LIKE (% _ \) e os separadores do filtro do PostgREST (, ( ) ) para
// o termo ser tratado como texto literal.
export const BUSCA_NOME_MIN = 3;

export function prepararBuscaNome(bruto: string | null | undefined): string | null {
  const limpo = String(bruto ?? "")
    .replace(/[%_\\,()]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return limpo.length >= BUSCA_NOME_MIN ? limpo : null;
}
