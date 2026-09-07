// Helper PURO da lista de cotacoes do admin. Sem rede/DB, testavel com o runner
// nativo do Node. Deriva os indicadores de topo (funil) a partir dos status.

export type ResumoCotacoes = {
  total: number;
  rascunhos: number; // draft — em construcao
  emitidas: number; // issued + viewed + option_selected — no ar, aguardando cliente
  opcaoEscolhida: number; // option_selected — subset acionavel (converter)
  convertidas: number; // converted — sucesso
  encerradas: number; // expired + cancelled — fora do funil
};

// "Emitida no ar" = qualquer estado a partir de issued com token vivo. Mesma
// familia de `jaEmitida` (quote-issue.ts), duplicada aqui de proposito para o
// modulo seguir folha/puro (sem import @/-alias, testavel sem mocks).
const NO_AR = new Set(["issued", "viewed", "option_selected"]);
const ENCERRADAS = new Set(["expired", "cancelled"]);

export function resumoCotacoes(quotes: Array<{ status: string }>): ResumoCotacoes {
  const r: ResumoCotacoes = {
    total: quotes.length,
    rascunhos: 0,
    emitidas: 0,
    opcaoEscolhida: 0,
    convertidas: 0,
    encerradas: 0,
  };
  for (const q of quotes) {
    const s = q.status;
    if (s === "draft") r.rascunhos += 1;
    else if (s === "converted") r.convertidas += 1;
    else if (ENCERRADAS.has(s)) r.encerradas += 1;
    if (NO_AR.has(s)) r.emitidas += 1;
    if (s === "option_selected") r.opcaoEscolhida += 1;
  }
  return r;
}
