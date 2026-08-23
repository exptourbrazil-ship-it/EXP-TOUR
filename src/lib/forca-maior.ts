// Validacao PURA da selecao de coorte da forca maior (processo E8, doc 01 §4).
// Sem rede/DB, testavel. A forca maior e aplicada EM LOTE por destino e periodo
// (opcional), so pelo gestor. Aqui validamos as entradas antes de montar a
// query do coorte.

// Data no formato ISO curto YYYY-MM-DD e valida no calendario.
export function dataISOValida(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [ano, mes, dia] = s.split("-").map(Number);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return false;
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  return d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

// Periodo opcional: cada extremo, se presente, precisa ser data ISO valida; e o
// inicio nao pode ser depois do fim. Ambos ausentes = periodo aberto (valido).
export function periodoValido(de?: string | null, ate?: string | null): boolean {
  if (de != null && de !== "" && !dataISOValida(de)) return false;
  if (ate != null && ate !== "" && !dataISOValida(ate)) return false;
  if (de && ate && de > ate) return false;
  return true;
}

// Destino (slug de pais_destino) valido para o coorte: string nao vazia,
// tamanho sao (evita filtro vazio que pegaria todo mundo).
export function destinoValido(destino: unknown): destino is string {
  return typeof destino === "string" && destino.trim().length >= 2 && destino.trim().length <= 64;
}
