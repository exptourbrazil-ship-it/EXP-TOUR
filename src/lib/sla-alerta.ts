// Montagem do ALERTA de SLA estourado (aviso interno). Módulo PURO.
//
// Separado da rota/cron para ser testável sem rede nem banco: o cron só carrega
// o painel (tenant-scoped) e envia; a regra do que vai no e-mail está aqui.
//
// Modelo de DIGEST (mesma escolha de alerta-eventos): um único e-mail por dia
// por tenant, listando os SLAs ABERTOS já ESTOURADOS (status vencido). Reenviar
// no dia seguinte é proposital — SLA que continua estourado continua sendo
// problema, e silêncio não é resolução. Por ser um resumo único por dia, não
// precisa de idempotência por caso no ledger (a cadência natural é 1/dia).

export type EntradaAlertaSLA = {
  tipoLabel: string;
  titularNome: string | null;
  titularId: string;
  atrasoDiasUteis: number;
};

export type ResumoAlertaSLA = { assunto: string; texto: string };

// Monta o assunto+corpo do alerta a partir dos SLAs estourados. Devolve `null`
// quando não há nada a alertar (nenhum estourado) — o cron então não envia.
// `venceHoje` entra só como contexto ("além disso, N vencem hoje"). `appUrl` (se
// houver) vira link absoluto para o painel; sem ela, cai no caminho relativo.
export function montarResumoAlertaSLA(params: {
  estourados: EntradaAlertaSLA[];
  venceHoje: number;
  marca: string;
  appUrl?: string | null;
}): ResumoAlertaSLA | null {
  const { estourados, venceHoje, marca } = params;
  if (estourados.length === 0) return null;

  // Mais atrasado no topo (mesma leitura de urgência do painel).
  const ordenados = [...estourados].sort((a, b) => b.atrasoDiasUteis - a.atrasoDiasUteis);

  const linhas = ordenados.map((e) => {
    const nome = e.titularNome || "(sem nome)";
    const dias = e.atrasoDiasUteis;
    // Um caso ja "vencido" pode ter atraso 0 dias uteis (ex.: sabado logo apos um
    // prazo na sexta): estourou, mas nenhum dia util passou. "0 dias uteis de
    // atraso" lê estranho, entao damos um texto proprio.
    if (dias <= 0) return `- ${e.tipoLabel} — ${nome}: prazo vencido (0 dias úteis)`;
    const plural = dias === 1 ? "dia útil" : "dias úteis";
    return `- ${e.tipoLabel} — ${nome}: ${dias} ${plural} de atraso`;
  });

  const base = (params.appUrl || "").trim().replace(/\/$/, "");
  const linkPainel = base ? `${base}/admin/sla` : "/admin/sla";

  const n = estourados.length;
  const cab = `${n} SLA(s) estourado(s) — ${marca}`;

  const corpo = [
    `${n} exceção(ões) com o SLA já vencido (prazo em dias úteis, doc 18.6).`,
    "",
    ...linhas,
    "",
    venceHoje > 0 ? `Além disso, ${venceHoje} vence(m) hoje.` : "",
    "",
    `Fila priorizada por urgência em ${linkPainel}.`,
  ]
    .filter((l, i, arr) => !(l === "" && arr[i - 1] === "")) // colapsa linhas vazias duplas
    .join("\n");

  return { assunto: cab, texto: corpo };
}
