// Helpers PUROS do resumo semanal do fornecedor (alerta 9, doc 06 secao 2).
// Sem rede/DB: montam o conteudo e a chave de idempotencia por semana. Testado
// em resumo-semanal.test.ts.

export type ContagemSemana = {
  pendenciasAbertas: number;
  novosEstudantes: number;
  novosDocumentos: number;
};

export type Resumo = {
  temAtividade: boolean; // false -> nao envia (semana sem nada, sem spam)
  contagem: ContagemSemana;
};

// Numero da semana ISO-8601 (segunda a domingo). Puro. Ex.: "2026-W35".
export function semanaISO(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return "0000-W00";
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  // ISO: quinta-feira da semana define o ano; dia 1..7 (seg=1).
  const dia = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dia);
  const anoInicio = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const semana = Math.ceil(((d.getTime() - anoInicio.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(semana).padStart(2, "0")}`;
}

// Monta o resumo a partir das contagens. So ha "atividade" se algo acontece.
export function montarResumoSemanal(c: ContagemSemana): Resumo {
  const contagem = {
    pendenciasAbertas: Math.max(0, Math.floor(c.pendenciasAbertas || 0)),
    novosEstudantes: Math.max(0, Math.floor(c.novosEstudantes || 0)),
    novosDocumentos: Math.max(0, Math.floor(c.novosDocumentos || 0)),
  };
  const temAtividade = contagem.pendenciasAbertas > 0 || contagem.novosEstudantes > 0 || contagem.novosDocumentos > 0;
  return { temAtividade, contagem };
}

// Chave de idempotencia do envio (um resumo por fornecedor por semana).
export function chaveResumo(supplierId: string, semana: string): string {
  return `resumo_semanal:${supplierId}:${semana}`;
}

// Conteudo bilingue do e-mail (EN padrao, PT quando o usuario e pt).
export function conteudoResumo(r: Resumo, idioma: string): { subject: string; titulo: string; contexto: string; botaoLabel: string } {
  const en = idioma !== "pt";
  const c = r.contagem;
  const partes: string[] = [];
  if (en) {
    if (c.pendenciasAbertas > 0) partes.push(`${c.pendenciasAbertas} open item${c.pendenciasAbertas > 1 ? "s" : ""}`);
    if (c.novosEstudantes > 0) partes.push(`${c.novosEstudantes} new student${c.novosEstudantes > 1 ? "s" : ""}`);
    if (c.novosDocumentos > 0) partes.push(`${c.novosDocumentos} new document${c.novosDocumentos > 1 ? "s" : ""}`);
  } else {
    if (c.pendenciasAbertas > 0) partes.push(`${c.pendenciasAbertas} pendência${c.pendenciasAbertas > 1 ? "s" : ""} aberta${c.pendenciasAbertas > 1 ? "s" : ""}`);
    if (c.novosEstudantes > 0) partes.push(`${c.novosEstudantes} novo${c.novosEstudantes > 1 ? "s" : ""} estudante${c.novosEstudantes > 1 ? "s" : ""}`);
    if (c.novosDocumentos > 0) partes.push(`${c.novosDocumentos} documento${c.novosDocumentos > 1 ? "s" : ""} novo${c.novosDocumentos > 1 ? "s" : ""}`);
  }
  const lista = partes.join(en ? ", " : ", ");
  return en
    ? {
        subject: "Your weekly summary",
        titulo: "This week at a glance",
        contexto: `Here's what needs your attention this week: ${lista}.`,
        botaoLabel: "Open my dashboard",
      }
    : {
        subject: "Seu resumo semanal",
        titulo: "A semana em resumo",
        contexto: `O que precisa da sua atenção esta semana: ${lista}.`,
        botaoLabel: "Abrir meu painel",
      };
}
