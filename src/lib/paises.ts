// Rotulos e bandeiras de pais usados na UI (orcamento publico e construtor de
// cotacao). Fonte: `campus.country_code` (char2, ISO 3166-1 alfa-2).
//
// NB: modulo PURO — sem dependencia de rede/DB.

/** country_code -> rotulo curto usado na UI. */
export const PAIS_LABEL: Record<string, string> = {
  GB: "UK",
  MT: "Malta",
  US: "US",
  CA: "Canada",
  NZ: "New Zealand",
  IE: "Ireland",
};

/** country_code -> bandeira. */
export const PAIS_FLAG: Record<string, string> = {
  GB: "🇬🇧",
  MT: "🇲🇹",
  US: "🇺🇸",
  CA: "🇨🇦",
  NZ: "🇳🇿",
  IE: "🇮🇪",
};

/** Rotulo do pais; cai no proprio codigo quando nao mapeado. */
export function rotuloPais(codigo: string | null | undefined): string {
  const c = (codigo ?? "").toUpperCase();
  return PAIS_LABEL[c] || c;
}

/** Bandeira do pais; vazio quando nao mapeado. */
export function bandeiraPais(codigo: string | null | undefined): string {
  return PAIS_FLAG[(codigo ?? "").toUpperCase()] || "";
}
