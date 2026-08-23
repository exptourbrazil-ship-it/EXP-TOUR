// Deteccao de DISPUTA de pagamento do Mercado Pago (processo E9, doc 01 §4).
// PURO (sem rede/DB), testavel. O status vem do proprio pagamento no MP: quando
// o cliente contesta (MED Pix) o pagamento entra em "in_mediation"; um
// chargeback perdido vira "charged_back". Ambos disparam o E9.
//
// Refund (refunded / partially_refunded) NAO e disputa — e devolucao (acerto /
// E4), fora do escopo do E9.
//
// PREMISSA de integracao: detectamos a disputa reconsultando o STATUS do
// pagamento no MP (in_mediation/charged_back). Isso cobre a notificacao de
// topico `payment` cujo data.id e o payment id. Se a conta MP for configurada
// para enviar o topico dedicado `chargebacks`/`disputes`, o data.id sera o id da
// disputa (nao do pagamento) e seria preciso mapear disputa->pagamento antes de
// tratar. Nao implementado aqui por nao ser verificavel sem essa config ativa.

export const STATUS_DISPUTA_MP = ["in_mediation", "charged_back"] as const;
export type StatusDisputaMP = (typeof STATUS_DISPUTA_MP)[number];

export function ehStatusDisputaMP(status: string | null | undefined): boolean {
  return typeof status === "string" && (STATUS_DISPUTA_MP as readonly string[]).includes(status);
}

export const LABEL_STATUS_DISPUTA_MP: Record<string, string> = {
  in_mediation: "Em mediação (MED Pix)",
  charged_back: "Chargeback",
};

export function labelStatusDisputaMP(status: string | null): string {
  if (!status) return "Em disputa";
  return LABEL_STATUS_DISPUTA_MP[status] ?? status;
}
