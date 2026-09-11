// Vocabulario e regras PURAS do funil de LEADS (sem rede/DB), para serem
// testadas sem mocks e reutilizadas por rotas, servico e UI. O lead nasce do
// orcamento lead-facing (/orcamento -> /api/orcamento/matricula) e e trabalhado
// pelo consultor no admin ate virar cliente (titular verificado) + cotacao.

export const STATUS_LEAD = ["novo", "em_contato", "cotacao", "convertido", "descartado"] as const;
export type StatusLead = (typeof STATUS_LEAD)[number];

export const STATUS_LEAD_LABEL: Record<StatusLead, string> = {
  novo: "Novo",
  em_contato: "Em contato",
  cotacao: "Cotação enviada",
  convertido: "Convertido",
  descartado: "Descartado",
};

// Estados terminais: nao ha proxima transicao automatica no funil de captacao.
// (convertido = virou cliente; descartado = encerrado sem negocio).
export const STATUS_LEAD_TERMINAL: ReadonlySet<StatusLead> = new Set(["convertido", "descartado"]);

export function statusLeadValido(s: unknown): s is StatusLead {
  return typeof s === "string" && (STATUS_LEAD as readonly string[]).includes(s);
}

// Transicoes permitidas do funil. O consultor pode andar para a frente e
// tambem "voltar" um passo (ex.: reabrir um descartado como novo). A conversao
// em cliente NAO passa por aqui — ela e uma acao propria (criar titular +
// cotacao) que, ao concluir, marca o lead como 'convertido'.
const TRANSICOES: Record<StatusLead, ReadonlySet<StatusLead>> = {
  novo: new Set(["em_contato", "cotacao", "descartado"]),
  em_contato: new Set(["novo", "cotacao", "descartado"]),
  cotacao: new Set(["em_contato", "descartado"]),
  // Terminais podem ser reabertos como 'novo' (ex.: descartado por engano, ou
  // cliente convertido que voltou com outro interesse).
  convertido: new Set(["novo"]),
  descartado: new Set(["novo"]),
};

// Uma transicao manual de status e permitida? Ficar no mesmo status nao e
// transicao (no-op) — a rota trata isso a parte.
export function podeTransicionarLead(de: StatusLead, para: StatusLead): boolean {
  if (de === para) return false;
  return TRANSICOES[de]?.has(para) ?? false;
}

// Proximos status oferecidos na UI para um lead no status atual.
export function proximosStatusLead(de: StatusLead): StatusLead[] {
  return STATUS_LEAD.filter((s) => podeTransicionarLead(de, s));
}

// Resumo de contagem por status, para os indicadores do topo da lista.
export function resumoLeads(leads: { status: string }[]): Record<StatusLead | "total", number> {
  const base = { total: leads.length } as Record<StatusLead | "total", number>;
  for (const s of STATUS_LEAD) base[s] = 0;
  for (const l of leads) {
    if (statusLeadValido(l.status)) base[l.status] += 1;
  }
  return base;
}
