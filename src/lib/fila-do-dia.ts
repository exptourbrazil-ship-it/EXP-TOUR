// Helpers PUROS da Fila do Dia (doc 07, Secoes 3.1 e 5). Sem rede/DB, para
// serem testados sem mocks. A tela e o carregador (server-side) usam estes
// helpers para compor e priorizar a fila a partir das fontes reais (documentos
// a analisar, parcelas em D+10, exceptions, etc.).

// Parametros de negocio (v1). TODO: mover para config por instancia (TENANT)
// quando a tabela `config` existir — ver docs/07 (3.7) e o padrao no CLAUDE.md.
// Ficam como DEFAULT aqui e sao passados aos helpers, nunca embutidos na logica.
export const SLA_ANALISE_DOCUMENTO_DIAS = 2;
export const DIAS_COBRANCA_HUMANA = 10; // parcela nao paga vira tarefa humana em D+10

const MS_DIA = 24 * 60 * 60 * 1000;

export type CategoriaFila =
  | "documento"
  | "parcela"
  | "proposta"
  | "fornecedor"
  | "excecao"
  | "sistema"
  | "outro";

export type EstadoPrazo = "no_prazo" | "hoje" | "estourado";

export type ItemFila = {
  categoria: CategoriaFila;
  titulo: string;
  contexto?: string; // cliente/caso em texto curto
  href?: string; // acao de um clique
  criadoEm: string; // ISO
  idadeDias: number;
  estado: EstadoPrazo;
};

// Idade em dias inteiros de um timestamp ISO ate "agora" (nunca negativa).
export function idadeEmDias(iso: string, agoraMs: number): number {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 0;
  const dias = Math.floor((agoraMs - t) / MS_DIA);
  return dias > 0 ? dias : 0;
}

function utcDeISO(iso: string): number | null {
  if (!iso || iso.length < 10) return null;
  const [ano, mes, dia] = iso.slice(0, 10).split("-").map(Number);
  if (!ano || !mes || !dia) return null;
  return Date.UTC(ano, mes - 1, dia);
}

// Dias de atraso de uma parcela (calendario UTC). Positivo = vencida ha N dias;
// negativo = ainda vai vencer. 0 = vence hoje.
export function diasDeAtraso(vencimentoISO: string, hojeISO: string): number {
  const v = utcDeISO(vencimentoISO);
  const h = utcDeISO(hojeISO);
  if (v === null || h === null) return 0;
  return Math.round((h - v) / MS_DIA);
}

// Uma parcela nao paga entra na cobranca humana a partir de D+limiar.
export function entrouEmCobrancaHumana(
  diasAtraso: number,
  limiar: number = DIAS_COBRANCA_HUMANA
): boolean {
  return diasAtraso >= limiar;
}

// Estado do prazo a partir da idade vs SLA (em dias): sobra > 0 no prazo;
// sobra 0 vence hoje; sobra < 0 estourado.
export function estadoPrazo(idadeDias: number, slaDias: number): EstadoPrazo {
  const restante = slaDias - idadeDias;
  if (restante > 0) return "no_prazo";
  if (restante === 0) return "hoje";
  return "estourado";
}

// Ordena a fila SEM mutar o array recebido: excecoes primeiro; depois
// estourado > hoje > no_prazo; por fim, mais antigo primeiro (idade desc).
const RANK_ESTADO: Record<EstadoPrazo, number> = { estourado: 0, hoje: 1, no_prazo: 2 };
export function ordenarFila(itens: ItemFila[]): ItemFila[] {
  return [...itens].sort((a, b) => {
    const ax = a.categoria === "excecao" ? 0 : 1;
    const bx = b.categoria === "excecao" ? 0 : 1;
    if (ax !== bx) return ax - bx;
    const re = RANK_ESTADO[a.estado] - RANK_ESTADO[b.estado];
    if (re !== 0) return re;
    return b.idadeDias - a.idadeDias;
  });
}

// Rotulo curto de estado para a UI (icone/cor ficam na tela).
export const ESTADO_LABEL: Record<EstadoPrazo, string> = {
  no_prazo: "No prazo",
  hoje: "Vence hoje",
  estourado: "SLA estourado",
};
