// Vocabulário e indicadores de FORNECEDOR (supplier). PURO — sem rede/DB/imports
// de runtime — para ser testado sem mocks e reutilizado pela UB admin. Espelha o
// check de relationship_status do schema.

export const FORNECEDOR_STATUS = [
  "prospect",
  "requested",
  "connected",
  "paused",
  "declined",
  "disconnected",
] as const;
export type FornecedorStatus = (typeof FORNECEDOR_STATUS)[number];

export const FORNECEDOR_STATUS_LABEL: Record<string, string> = {
  prospect: "Prospect",
  requested: "Solicitado",
  connected: "Conectado",
  paused: "Pausado",
  declined: "Recusado",
  disconnected: "Desconectado",
};

// Classe Tailwind do badge por status. Conectado = verde; pausado = âmbar
// (atenção); recusado/desconectado = neutro apagado; demais = neutro.
export const FORNECEDOR_STATUS_BADGE: Record<string, string> = {
  prospect: "bg-neutral-100 text-neutral-600",
  requested: "bg-neutral-100 text-neutral-600",
  connected: "bg-emerald-100 text-emerald-700",
  paused: "bg-amber-100 text-amber-700",
  declined: "bg-neutral-100 text-neutral-400",
  disconnected: "bg-neutral-100 text-neutral-400",
};

// ── Indicadores da lista (topo) ─────────────────────────────────────────────
export type ResumoFornecedores = { total: number; conectados: number; comAcesso: number; preferidos: number };

export function resumoFornecedores(
  fornecedores: Array<{ status: string; preferido: boolean; temAcesso: boolean }>,
): ResumoFornecedores {
  let conectados = 0;
  let comAcesso = 0;
  let preferidos = 0;
  for (const f of fornecedores) {
    if (f.status === "connected") conectados += 1;
    if (f.temAcesso) comAcesso += 1;
    if (f.preferido) preferidos += 1;
  }
  return { total: fornecedores.length, conectados, comAcesso, preferidos };
}
