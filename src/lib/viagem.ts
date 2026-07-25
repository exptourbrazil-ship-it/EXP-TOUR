// Helpers puros da aba Viagem (contatos, emergencia e mapas). Sem dependencia
// de rede/DB, testaveis com o runner nativo do Node (ver src/lib/viagem.test.ts).
//
// Contatos publicos da EXP Tour. Mantidos aqui (nao importados de nps.ts) para
// preservar a convencao de libs puras e autocontidas do projeto -- se mudarem,
// atualize tambem src/lib/nps.ts.
export const SITE_PUBLICO_EXP_TOUR = "https://www.exp-tour.com";
export const WHATSAPP_EXP_TOUR = "+1 778-682-7927";

export type InfoEmergencia = { pais: string; numeroEmergencia: string };

// Numero de emergencia por destino (dado factual e estavel). O consulado nao
// entra aqui para nao arriscar telefone incorreto; fica para uma proxima versao.
export const EMERGENCIA_POR_DESTINO: Record<string, InfoEmergencia> = {
  canada: { pais: "Canada", numeroEmergencia: "911" },
  eua: { pais: "Estados Unidos", numeroEmergencia: "911" },
  nova_zelandia: { pais: "Nova Zelandia", numeroEmergencia: "111" },
};

export function emergenciaDoDestino(paisDestino: string | null | undefined): InfoEmergencia | null {
  if (!paisDestino) return null;
  return EMERGENCIA_POR_DESTINO[paisDestino] || null;
}

// Link de busca no Google Maps a partir de um endereco em texto livre.
// Retorna null quando nao ha endereco.
export function montarLinkMapa(endereco: string | null | undefined): string | null {
  const e = (endereco || "").trim();
  if (!e) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e)}`;
}

// Link wa.me para falar com o suporte da EXP Tour (numero comercial). Aqui o
// numero de destino ESTA presente (diferente da indicacao, que e sem destino).
export function montarLinkSuporteWhatsApp(): string {
  const numero = WHATSAPP_EXP_TOUR.replace(/[^0-9]/g, "");
  return `https://wa.me/${numero}`;
}
