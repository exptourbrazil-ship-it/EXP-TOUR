// Quadro de horários da proposta (puro, sem rede/DB).
//
// A grade vem como lista de dias com blocos (`BlocoTimetable[]`). Para exibir como
// quadro, dias com a MESMA agenda viram uma coluna só ("Segunda a sexta"), e cada
// linha é uma faixa de horário. Se algum bloco não tem horário (ex.: "horário
// flexível"), não há como montar quadro: devolve null e a tela mantém a lista.
import type { BlocoAula, BlocoTimetable } from "./produto-conteudo.ts";

export type ColunaQuadro = { rotulo: string };
export type LinhaQuadro = {
  horario: string;
  /** Uma célula por coluna; null quando a coluna não tem aula nessa faixa. */
  celulas: (string | null)[];
  /** Todas as células preenchidas são intervalo (renderizado em itálico). */
  intervalo: boolean;
};
export type QuadroHorarios = { colunas: ColunaQuadro[]; linhas: LinhaQuadro[] };

const DIAS = ["segunda", "terca", "quarta", "quinta", "sexta", "sabado", "domingo"];
const ROTULO_DIA = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

function indiceDoDia(dia: string): number {
  const base = dia
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
  return DIAS.findIndex((d) => base.startsWith(d.slice(0, 3)));
}

function ehIntervalo(b: BlocoAula): boolean {
  return b.isIntervalo ?? b.descricao.toLowerCase().includes("intervalo");
}

function chaveDoDia(blocos: BlocoAula[]): string {
  return JSON.stringify(blocos.map((b) => [b.inicio, b.fim, b.descricao, ehIntervalo(b)]));
}

/** "Segunda a sexta", "Segunda", "Segunda, quarta e sexta" a partir dos índices/nomes do grupo. */
function rotuloDoGrupo(dias: string[]): string {
  const idx = dias.map(indiceDoDia);
  if (idx.every((i) => i >= 0)) {
    const consecutivos = idx.every((v, k) => k === 0 || v === idx[k - 1] + 1);
    if (dias.length === 1) return ROTULO_DIA[idx[0]];
    if (consecutivos) return `${ROTULO_DIA[idx[0]]} a ${ROTULO_DIA[idx[idx.length - 1]].toLowerCase()}`;
    const nomes = idx.map((i, k) => (k === 0 ? ROTULO_DIA[i] : ROTULO_DIA[i].toLowerCase()));
    return `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
  }
  return dias.join(", ");
}

export function montarQuadroHorarios(tt: BlocoTimetable[] | null | undefined): QuadroHorarios | null {
  if (!tt || tt.length === 0) return null;
  if (tt.some((d) => d.blocos.some((b) => !b.inicio || !b.fim))) return null;

  // Agrupa dias com agenda idêntica, na ordem em que aparecem.
  const grupos: { dias: string[]; blocos: BlocoAula[] }[] = [];
  for (const d of tt) {
    const g = grupos.find((x) => chaveDoDia(x.blocos) === chaveDoDia(d.blocos));
    if (g) g.dias.push(d.dia);
    else grupos.push({ dias: [d.dia], blocos: d.blocos });
  }

  const faixas = new Map<string, { inicio: string; fim: string }>();
  for (const g of grupos) for (const b of g.blocos) faixas.set(`${b.inicio}|${b.fim}`, { inicio: b.inicio!, fim: b.fim! });
  const ordenadas = [...faixas.entries()].sort(([, a], [, b]) => a.inicio.localeCompare(b.inicio) || a.fim.localeCompare(b.fim));

  const linhas: LinhaQuadro[] = ordenadas.map(([chave, f]) => {
    const blocosDaFaixa = grupos.map((g) => g.blocos.find((b) => `${b.inicio}|${b.fim}` === chave) ?? null);
    const preenchidos = blocosDaFaixa.filter((b): b is BlocoAula => b !== null);
    return {
      horario: `${f.inicio}–${f.fim}`,
      celulas: blocosDaFaixa.map((b) => (b ? b.descricao || "Aula" : null)),
      intervalo: preenchidos.length > 0 && preenchidos.every(ehIntervalo),
    };
  });

  return { colunas: grupos.map((g) => ({ rotulo: rotuloDoGrupo(g.dias) })), linhas };
}
