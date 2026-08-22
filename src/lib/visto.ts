// Vocabulario do resultado do visto (por contrato/estudante). PURO (sem
// rede/DB), testavel. A transicao para "negado" dispara o processo de excecao
// E1 (doc 01 §4) — ver src/lib/visto-service.ts.

export const STATUS_VISTO = ["em_analise", "aprovado", "negado"] as const;
export type StatusVisto = (typeof STATUS_VISTO)[number];

export const LABEL_STATUS_VISTO: Record<StatusVisto, string> = {
  em_analise: "Em análise",
  aprovado: "Aprovado",
  negado: "Negado",
};

export function statusVistoValido(v: unknown): v is StatusVisto {
  return typeof v === "string" && (STATUS_VISTO as readonly string[]).includes(v);
}

export function labelStatusVisto(v: string | null): string {
  if (!v) return "Não informado";
  return (LABEL_STATUS_VISTO as Record<string, string>)[v] ?? v;
}

// Dispara o E1 (visto negado) apenas na TRANSICAO para "negado": o novo status
// e "negado" e o anterior nao era. Assim, regravar "negado" nao reabre o
// processo nem dispara nova notificacao/tarefa.
export function disparaExcecaoVistoNegado(anterior: string | null, novo: string): boolean {
  return novo === "negado" && anterior !== "negado";
}
