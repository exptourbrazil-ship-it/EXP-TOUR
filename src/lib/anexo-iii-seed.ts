// Motor PURO do Anexo III semeado pela cotacao aceita (Clausula 7.5.2). Sem
// rede/DB: transforma as linhas da opcao escolhida em itens-base do Anexo III
// (um por linha: programa, acomodacao, seguro, servicos), cada um com fornecedor,
// natureza, valor bruto, moeda e o prazo D-30. Os campos de POLITICA da escola
// (evento, documento, consequencia, cancelamento) NAO vem da cotacao e ficam
// para a equipe completar no /admin/anexo-iii. Testado em anexo-iii-seed.test.ts.

export type ItemCotacaoAnexo = {
  grupo: string; // program | accommodation | insurance | other | package
  nome: string | null; // nome do item (product_snapshot.name)
  valor: number; // bruto do item, na moeda de origem
  moeda: string;
  startDate: string | null; // inicio do item (define o prazo D-30 da linha)
  fornecedor: string | null; // display_name do supplier resolvido; null -> a confirmar
};

export type AnexoIIIItemSeed = {
  fornecedor: string;
  natureza: string | null;
  valor: number;
  moeda: string;
  prazo: string | null;
  fonte: string | null;
  ordem: number;
};

const ROTULO_GRUPO: Record<string, string> = {
  program: "Curso/Programa",
  accommodation: "Acomodacao",
  insurance: "Seguro",
  other: "Servico",
  package: "Pacote",
};

function centavos(n: unknown): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

// Prazo textual D-30: 30 dias antes do inicio (da linha, ou do contrato). Puro,
// aritmetica em UTC (data civil).
export function prazoD30(dataISO: string | null | undefined): string {
  if (!dataISO || dataISO.length < 10) return "30 dias antes do inicio do programa";
  const [y, m, d] = dataISO.slice(0, 10).split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d) - 30 * 86_400_000);
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  return `Ate ${dd}/${mm}/${dt.getUTCFullYear()} (30 dias antes do inicio)`;
}

// Monta o seed do Anexo III a partir das linhas da opcao aceita. Um item por
// linha COM valor > 0 (linha gratuita nao e obrigacao de pagamento). `ordem`
// sequencial na ordem recebida. `dataInicioContrato` e o fallback do prazo
// quando a linha nao tem data propria.
export function montarAnexoIIISeed(args: {
  itens: ItemCotacaoAnexo[];
  dataInicioContrato: string | null;
  referencia: string;
}): AnexoIIIItemSeed[] {
  const seed: AnexoIIIItemSeed[] = [];
  let ordem = 0;
  for (const it of args.itens || []) {
    const valor = centavos(it.valor);
    if (valor <= 0) continue;
    seed.push({
      fornecedor: (it.fornecedor && it.fornecedor.trim()) || "Fornecedor a confirmar",
      natureza: (it.nome && it.nome.trim()) || ROTULO_GRUPO[it.grupo] || it.grupo || null,
      valor,
      moeda: (it.moeda || "").toUpperCase() || "BRL",
      prazo: prazoD30(it.startDate || args.dataInicioContrato),
      fonte: `Cotacao ${args.referencia}`,
      ordem,
    });
    ordem++;
  }
  return seed;
}
