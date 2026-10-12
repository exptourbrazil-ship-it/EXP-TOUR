// Avisos de disponibilidade na cotação (puro, sem rede/DB).
//
// A Disponibilidade cadastrada no hub (datas de início dos programas e janelas
// das acomodações) NÃO bloqueia a cotação: a equipe pode cotar uma data que a
// escola aceite fora da lista. Aqui só se gera o AVISO, em português, que segue
// junto com os demais warnings do item (nunca com o prefixo "Warning bloqueante").
//
// Sem dado cadastrado = sem aviso: ausência de lista não é prova de indisponível.

export type IntakeDisp = { startDate: string; status: string };
export type PeriodoDisp = { periodStart: string; periodEnd: string | null; status: string };

const MAX_SUGESTOES = 3;

function fmtData(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

/** Soma `dias` a uma data ISO (UTC, sem fuso). */
export function somarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/**
 * Programa: a data de início precisa bater com uma das datas cadastradas.
 * Devolve no máximo 1 aviso.
 */
export function avisoDeIntake(startDate: string, intakes: IntakeDisp[]): string[] {
  if (intakes.length === 0) return [];
  const exata = intakes.find((i) => i.startDate === startDate);
  if (exata) {
    if (exata.status === "closed") return [`Turma de ${fmtData(startDate)} encerrada. Confirme com a escola.`];
    if (exata.status === "waitlist") return [`Turma de ${fmtData(startDate)} em lista de espera.`];
    if (exata.status === "limited") return [`Turma de ${fmtData(startDate)} com poucas vagas. Confirme com a escola.`];
    return [];
  }
  const abertas = intakes.filter((i) => i.status !== "closed").map((i) => i.startDate).sort();
  const proximas = abertas.filter((d) => d > startDate).slice(0, MAX_SUGESTOES);
  const sugestao =
    proximas.length > 0
      ? ` Próximas: ${proximas.map(fmtData).join(", ")}.`
      : abertas.length > 0
        ? ` Última turma: ${fmtData(abertas[abertas.length - 1])}.`
        : "";
  return [`${fmtData(startDate)} fora das turmas cadastradas.${sugestao}`];
}

/**
 * Acomodação: a estadia inteira [início, fim) precisa caber em UM período aberto.
 * `fim` é nulo quando a duração não é em semanas (só o início é conferido).
 */
export function avisoDePeriodo(startDate: string, fim: string | null, periodos: PeriodoDisp[]): string[] {
  if (periodos.length === 0) return [];
  const cobre = (p: PeriodoDisp) =>
    p.periodStart <= startDate && (p.periodEnd == null || (fim ?? startDate) <= p.periodEnd);
  const abertos = periodos.filter((p) => p.status === "open");
  if (abertos.some(cobre)) return [];
  const consulta = periodos.find((p) => p.status === "on_request" && cobre(p));
  if (consulta) return ["Acomodação só sob consulta neste período. Confirme com a escola."];
  const fechado = periodos.find((p) => p.status === "closed" && cobre(p));
  if (fechado) return ["Acomodação fechada neste período. Confirme com a escola."];
  const janelas = [...periodos]
    .filter((p) => p.status === "open")
    .sort((a, b) => a.periodStart.localeCompare(b.periodStart))
    .map((p) => `${fmtData(p.periodStart)}${p.periodEnd ? ` a ${fmtData(p.periodEnd)}` : " em diante"}`);
  const lista = janelas.length > 0 ? ` Disponível: ${janelas.join("; ")}.` : "";
  return [`Estadia fora dos períodos cadastrados.${lista}`];
}
