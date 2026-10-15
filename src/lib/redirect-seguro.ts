// Destino de redirecionamento pos-login (?next=). So aceita CAMINHO interno da
// propria area (mesma origem): comeca com "/", nao com "//" nem "/\\", nao tem
// esquema nem caracteres de controle, e esta dentro do prefixo esperado. Qualquer
// outra coisa volta ao padrao. Evita open redirect para dominio externo.
export function proximoSeguro(next: string | null | undefined, prefixo: string, padrao: string): string {
  if (typeof next !== "string" || !next) return padrao;
  if (/[\u0000-\u001f\u007f\\]/.test(next)) return padrao;
  if (!next.startsWith("/") || next.startsWith("//")) return padrao;
  const base = prefixo.replace(/\/+$/, "");
  const dentro = next === base || next.startsWith(base + "/") || next.startsWith(base + "?") || next.startsWith(base + "#");
  return dentro ? next : padrao;
}
