// Helper PURO do editor admin de data de inicio (titulares.data_inicio). Sem
// rede/DB, testavel com o runner nativo do Node. Modulo leaf: nao importa outros
// modulos com @/-alias.

export type TitularDataInicio = { data_inicio: string | null };

// Resumo de topo do editor: total de titulares, quantos ja tem data de inicio
// definida e quantos ainda estao sem. "com data" = valor nao vazio (ignora
// espacos). Puro; a UI so exibe.
export function resumoDatasInicio(
  titulares: TitularDataInicio[]
): { total: number; comData: number; semData: number } {
  let comData = 0;
  for (const t of titulares) if (t.data_inicio && t.data_inicio.trim()) comData += 1;
  return { total: titulares.length, comData, semData: titulares.length - comData };
}
