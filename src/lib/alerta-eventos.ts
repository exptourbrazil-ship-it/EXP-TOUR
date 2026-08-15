// Montagem do alerta de eventos com erro.
//
// Separado da rota para ser testavel sem rede nem banco (a rota so busca e
// envia). A regra que importa esta aqui: o resumo precisa dizer O QUE quebrou e
// QUANTAS vezes, agrupado por origem, para caber num e-mail que alguem le em
// dez segundos no celular.

export const JANELA_ALERTA_HORAS = 24;

export type EventoComErro = {
  source: string | null;
  event_type: string | null;
  external_id: string | null;
  erro: string | null;
  tentativas: number | null;
  updated_at: string | null;
};

// Agrupa por (origem, tipo, mensagem de erro). Vinte notificacoes rejeitadas
// pelo mesmo motivo sao UM problema, nao vinte — e listar as vinte esconderia
// um segundo problema no meio da enxurrada.
export function agruparPorCausa(
  eventos: EventoComErro[]
): { chave: string; quantidade: number; exemplo: EventoComErro }[] {
  const mapa = new Map<string, { chave: string; quantidade: number; exemplo: EventoComErro }>();

  for (const ev of eventos) {
    const chave = `${ev.source || "?"}/${ev.event_type || "?"}: ${(ev.erro || "sem mensagem").slice(0, 120)}`;
    const atual = mapa.get(chave);
    if (atual) {
      atual.quantidade++;
    } else {
      mapa.set(chave, { chave, quantidade: 1, exemplo: ev });
    }
  }

  return [...mapa.values()].sort((a, b) => b.quantidade - a.quantidade);
}

export function montarResumoAlerta(eventos: EventoComErro[], janelaHoras: number): string {
  const grupos = agruparPorCausa(eventos);

  const linhas = grupos.map((g) => {
    const ids = g.exemplo.external_id ? ` (ex.: ${g.exemplo.external_id})` : "";
    return `- ${g.quantidade}x ${g.chave}${ids}`;
  });

  return [
    `${eventos.length} evento(s) com status "erro" nas ultimas ${janelaHoras} horas.`,
    "",
    ...linhas,
    "",
    "Detalhes e reprocessamento manual em /admin/sistema.",
    "",
    "Lembrete: assinatura invalida no webhook do Mercado Pago costuma significar",
    "que MERCADOPAGO_WEBHOOK_SECRET nao e o segredo da MESMA aplicacao do",
    "MERCADOPAGO_ACCESS_TOKEN.",
  ].join("\n");
}
