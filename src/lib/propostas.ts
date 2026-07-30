// Helpers PUROS (sem rede/DB) de propostas (checkout, Cláusula 2.5), testáveis.

export type EstadoProposta = "valida" | "expirada" | "aceita" | "cancelada" | "indisponivel";

// Estado efetivo de uma proposta para a página pública:
//  - cancelada / aceita: refletem o status gravado;
//  - enviada e dentro da validade -> valida;
//  - enviada mas com validade vencida -> expirada;
//  - qualquer outro status (ex.: rascunho) -> indisponivel.
// `hojeISO` e `validade` em YYYY-MM-DD (compara só a data).
export function estadoProposta(
  p: { status: string; validade: string | null },
  hojeISO: string
): EstadoProposta {
  if (p.status === "cancelada") return "cancelada";
  if (p.status === "aceita") return "aceita";
  if (p.status !== "enviada") return "indisponivel";
  if (p.validade && p.validade.slice(0, 10) < hojeISO.slice(0, 10)) return "expirada";
  return "valida";
}
