// Helpers PUROS (sem rede/DB) do indice de contratos do admin. Ficam separados
// do loader (a pagina server-side) para poderem ser testados com o runner
// nativo do Node, sem mocks. Cuidam de derivar o status de assinatura mais
// recente por contrato e o resumo de topo (total, cancelados, por status, valor
// por moeda). Modulo leaf: nao importa outros modulos com @/-alias.

// Uma linha de contratos_assinatura (o loader ja seleciona estes campos).
export type AssinaturaInput = {
  contrato_id: string;
  status: string;
  criado_em: string | null;
};

// Deriva o status de assinatura MAIS RECENTE por contrato (maior criado_em).
// Nao depende da ordem do array de entrada. Retorna objeto contrato_id->status.
export function statusMaisRecentePorContrato(
  assinaturas: AssinaturaInput[]
): Record<string, string> {
  const melhor = new Map<string, { status: string; quando: string }>();
  for (const a of assinaturas) {
    if (!a.contrato_id || !a.status) continue;
    const quando = a.criado_em || "";
    const atual = melhor.get(a.contrato_id);
    if (!atual || quando > atual.quando) {
      melhor.set(a.contrato_id, { status: a.status, quando });
    }
  }
  const saida: Record<string, string> = {};
  for (const [id, v] of melhor) saida[id] = v.status;
  return saida;
}

// Campos que o resumo precisa de cada contrato da lista.
export type ContratoResumivel = {
  cancelado_em: string | null;
  assinatura_status: string | null;
  valor_total: number | string | null;
  moeda: string | null;
};

export type ResumoContratos = {
  total: number;
  ativos: number;
  cancelados: number;
  porStatusAssinatura: Record<string, number>; // status -> contagem (ativos); "sem" = sem assinatura
  valorPorMoeda: Record<string, number>; // soma de valor_total dos ativos, por moeda
};

function centavos(v: number): number {
  return Math.round(v * 100) / 100;
}

// Resumo de topo do indice: total/ativos/cancelados, contagem por status de
// assinatura (so contratos ATIVOS — cancelado nao pede assinatura) e valor total
// dos ativos por moeda. Puro; a UI so formata.
export function resumoContratos(contratos: ContratoResumivel[]): ResumoContratos {
  const porStatusAssinatura: Record<string, number> = {};
  const valorPorMoeda: Record<string, number> = {};
  let ativos = 0;
  let cancelados = 0;
  for (const c of contratos) {
    if (c.cancelado_em) {
      cancelados += 1;
      continue;
    }
    ativos += 1;
    const st = c.assinatura_status || "sem";
    porStatusAssinatura[st] = (porStatusAssinatura[st] || 0) + 1;
    const valor = Number(c.valor_total) || 0;
    if (valor > 0) {
      const moeda = (c.moeda || "?").toUpperCase();
      valorPorMoeda[moeda] = centavos((valorPorMoeda[moeda] || 0) + valor);
    }
  }
  return { total: contratos.length, ativos, cancelados, porStatusAssinatura, valorPorMoeda };
}
