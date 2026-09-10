// Helpers puros da aba Viagem (contatos, emergencia e mapas). Sem dependencia
// de rede/DB, testaveis com o runner nativo do Node (ver src/lib/viagem.test.ts).
//
// Contatos publicos da EXP Tour. Mantidos aqui (nao importados de nps.ts) para
// preservar a convencao de libs puras e autocontidas do projeto -- se mudarem,
// atualize tambem src/lib/nps.ts.
export const SITE_PUBLICO_EXP_TOUR = "https://www.exp-tour.com";
// WhatsApp de suporte do EXP Tour. O numero exibido no portal vem do TENANT
// (getTenantBrand(...).supportWhatsApp); esta constante e o default/fallback e o
// numero canonico do EXP Tour.
export const WHATSAPP_EXP_TOUR = "+1 778-682-7927";

export type InfoEmergencia = { pais: string; numeroEmergencia: string };

// Numero de emergencia por destino (dado factual e estavel). O consulado nao
// entra aqui para nao arriscar telefone incorreto; fica para uma proxima versao.
export const EMERGENCIA_POR_DESTINO: Record<string, InfoEmergencia> = {
  canada: { pais: "Canadá", numeroEmergencia: "911" },
  eua: { pais: "Estados Unidos", numeroEmergencia: "911" },
  nova_zelandia: { pais: "Nova Zelândia", numeroEmergencia: "111" },
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
export function montarLinkSuporteWhatsApp(whatsapp: string = WHATSAPP_EXP_TOUR): string {
  const numero = whatsapp.replace(/[^0-9]/g, "");
  return `https://wa.me/${numero}`;
}

// ── Editor admin de viagem_info: indicador de preenchimento ──────────────────
// Campos que compoem os dados de viagem de um contrato (todos opcionais).
export type ViagemInfoParcial = {
  escola_nome: string | null;
  escola_endereco: string | null;
  acomodacao_endereco: string | null;
  contato_local_nome: string | null;
  contato_local_telefone: string | null;
  observacoes: string | null;
} | null;

// "Preenchido" = existe registro E pelo menos um campo com conteudo util (nao
// apenas espacos). Uma linha toda vazia conta como pendente.
export function viagemPreenchida(info: ViagemInfoParcial): boolean {
  if (!info) return false;
  return [
    info.escola_nome,
    info.escola_endereco,
    info.acomodacao_endereco,
    info.contato_local_nome,
    info.contato_local_telefone,
    info.observacoes,
  ].some((v) => !!(v && v.trim()));
}

// Resumo de topo do editor: total de contratos, quantos com viagem preenchida e
// quantos pendentes. Puro; a UI so exibe.
export function resumoViagem(
  contratos: Array<{ info: ViagemInfoParcial }>
): { total: number; preenchidos: number; pendentes: number } {
  let preenchidos = 0;
  for (const c of contratos) if (viagemPreenchida(c.info)) preenchidos += 1;
  return { total: contratos.length, preenchidos, pendentes: contratos.length - preenchidos };
}
