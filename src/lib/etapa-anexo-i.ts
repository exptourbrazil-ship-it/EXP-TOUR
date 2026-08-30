// Derivacao PURA da etapa concluida do Anexo I a partir de sinais que ja
// existem no contrato. A etapa define o percentual de retencao escalonada
// (ver reembolso-anexo-i.ts). As chaves espelham ETAPAS_ANEXO_I_PADRAO.
//
// Ordem (da mais avancada para a mais inicial): visto/embarque -> LOA -> Entrada
// -> assinatura. Retorna a MAIS AVANCADA ja alcancada. O admin pode sobrepor
// manualmente (contratos.etapa_anexo_i) — este motor e apenas o padrao.
//
// SEM imports: roda no runner nativo do Node.

export type SinaisEtapa = {
  entradaPaga: boolean; // parcela de entrada com status 'pago'
  temLOA: boolean; // carta de aceite (LOA) no cofre do contrato
  vistoAprovado: boolean; // contratos.visto_status = 'aprovado'
};

export const ETAPA_CHAVES = ["assinatura", "entrada", "loa", "visto_embarque"] as const;
export type EtapaChave = (typeof ETAPA_CHAVES)[number];

export function derivarEtapaAnexoI(sinais: SinaisEtapa): EtapaChave {
  if (sinais.vistoAprovado) return "visto_embarque";
  if (sinais.temLOA) return "loa";
  if (sinais.entradaPaga) return "entrada";
  return "assinatura";
}

// Valida uma chave de etapa vinda de fora (override do admin / query).
export function etapaValida(v: unknown): v is EtapaChave {
  return typeof v === "string" && (ETAPA_CHAVES as readonly string[]).includes(v);
}
