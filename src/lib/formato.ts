// Formatadores puros de exibicao (moeda/data), compartilhados pelas telas do
// painel admin. Sem dependencia de rede/DB.

// Formata um valor na moeda do programa (CAD, USD, ...). Se a moeda nao for um
// codigo ISO de 3 letras valido (ex.: "?"), cai para "<MOEDA> <valor>".
export function fmtMoeda(valor: number, moeda: string): string {
  const codigo = (moeda || "").toUpperCase();
  if (/^[A-Z]{3}$/.test(codigo)) {
    try {
      return new Intl.NumberFormat("pt-BR", { style: "currency", currency: codigo }).format(valor);
    } catch {
      /* cai para o fallback */
    }
  }
  return `${codigo || "?"} ${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
}

export function fmtBRL(valor: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor);
}

// YYYY-MM-DD -> DD/MM/YYYY (sem criar Date, para nao esbarrar em fuso).
export function fmtData(iso: string): string {
  if (!iso || iso.length < 10) return iso || "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

// Junta { CAD: 12500, USD: 300 } em "CAD 12.500,00 · USD 300,00".
export function fmtPorMoeda(porMoeda: Record<string, number>): string {
  const entradas = Object.entries(porMoeda);
  if (entradas.length === 0) return "—";
  return entradas.map(([moeda, valor]) => fmtMoeda(valor, moeda)).join(" · ");
}
