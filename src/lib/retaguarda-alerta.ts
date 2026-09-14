// Montagem do ALERTA de retaguarda (aviso interno). Módulo PURO.
//
// Diferente do alerta de SLA (digest diário de TODOS os estourados), a retaguarda
// alerta só os achados NOVOS de severidade ALTA (abertos/reabertos nesta rodada).
// Os achados persistem e ficam visíveis no painel; re-alertar todo dia o mesmo
// achado seria ruído — o "aciona" da camada detectiva (spec 7-F) é o de deteção,
// não o de lembrete. O painel /admin/retaguarda é a fonte de verdade contínua.

export type EntradaAlertaRetaguarda = { categoria: string; resumo: string };
export type ResumoAlertaRetaguarda = { assunto: string; texto: string };

// Monta o assunto+corpo a partir dos achados ALTO novos. `null` quando não há
// nada novo a alertar (o cron então não envia).
export function montarResumoAlertaRetaguarda(params: {
  novos: EntradaAlertaRetaguarda[];
  marca: string;
  appUrl?: string | null;
}): ResumoAlertaRetaguarda | null {
  const { novos, marca } = params;
  if (novos.length === 0) return null;

  const linhas = novos.map((n) => `- ${n.resumo}`);
  const base = (params.appUrl || "").trim().replace(/\/$/, "");
  const linkPainel = base ? `${base}/admin/retaguarda` : "/admin/retaguarda";

  const n = novos.length;
  const assunto = `${n} achado(s) ALTO de retaguarda — ${marca}`;

  const texto = [
    `A varredura de retaguarda encontrou ${n} inconsistência(s) de severidade ALTA (nova(s) nesta rodada).`,
    "",
    ...linhas,
    "",
    "O sistema apenas sinaliza — a verificação e a decisão são humanas.",
    `Fila completa (todos os achados abertos) em ${linkPainel}.`,
  ].join("\n");

  return { assunto, texto };
}
