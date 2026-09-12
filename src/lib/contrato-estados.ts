// Motor PURO da máquina de estados do contrato (jornada), a fonte única do
// "em que ponto este contrato está". Espelha a máquina formal de docs/03
// (§2.1, estados 0–8) + os terminais (proposta expirada, cancelado, concluído).
//
// Duas responsabilidades, ambas puras e determinísticas (sem rede/DB):
//  1. TRANSIÇÕES válidas — quem pode virar quem (podeTransicionar/proximosEstados).
//     Usado quando a máquina passar a ser PERSISTIDA (grava a transição + trilha).
//  2. DERIVAÇÃO retrocompatível — a partir dos FATOS que já existem hoje
//     (entrada paga, aceite do Termo, docs, visto, relógios de início/retorno),
//     deduz o estado atual. É o que permite ligar a máquina sem migração big-bang:
//     contratos provisionados pelo CRM, sem trilha, ainda têm um estado correto.
//
// Realidade atual do portal (ver CLAUDE.md / estado-do-portal): o Zoho Sign está
// INATIVO, então "contrato assinado" é representado pelo ACEITE do Termo de adesão
// no checkout (aceites + hash). A derivação trata o aceite como o sinal contratual
// operante enquanto o Sign não entra. Onde falta sinal confiável, o estado
// permanece no passo pendente — nunca inventa progresso (mesma filosofia de
// jornada.ts).

export type EstadoContrato =
  | "proposta_enviada" // 0 — link de checkout gerado; aguardando pagamento
  | "entrada_paga" // 1 — webhook MP confirmou a entrada (gatilho-mestre)
  | "aguardando_contrato" // 2 — pago; aguardando aceite/assinatura do contrato
  | "matricula" // 3 — contrato aceito; ficha/matrícula da escola em curso
  | "documentacao" // 4 — matrícula ok; documentos obrigatórios em análise
  | "visto" // 5 — documentos aprovados; processo de visto
  | "pre_embarque" // 6 — visto aprovado (ou destino isento); checklist
  | "em_programa" // 7 — data de início chegou; estudante em viagem
  | "retorno" // 8 — data de retorno chegou; sequência de retorno
  | "concluido" // terminal — jornada encerrada com sucesso
  | "proposta_expirada" // terminal (recuperável) — validade passou sem pagamento
  | "cancelado"; // terminal — cancelamento (tipo em contratos.cancelado_tipo)

// Ordem canônica (inclui terminais no fim). A ordem da linha principal define o
// "quão longe" a jornada chegou na derivação.
export const ESTADOS_CONTRATO: EstadoContrato[] = [
  "proposta_enviada",
  "entrada_paga",
  "aguardando_contrato",
  "matricula",
  "documentacao",
  "visto",
  "pre_embarque",
  "em_programa",
  "retorno",
  "concluido",
  "proposta_expirada",
  "cancelado",
];

const ROTULOS: Record<EstadoContrato, string> = {
  proposta_enviada: "Proposta enviada",
  entrada_paga: "Entrada paga",
  aguardando_contrato: "Aguardando contrato",
  matricula: "Matrícula",
  documentacao: "Documentação",
  visto: "Visto",
  pre_embarque: "Pré-embarque",
  em_programa: "Em programa",
  retorno: "Retorno",
  concluido: "Concluído",
  proposta_expirada: "Proposta expirada",
  cancelado: "Cancelado",
};

export function rotuloEstado(e: EstadoContrato): string {
  return ROTULOS[e] ?? e;
}

export function estadoValido(e: string): e is EstadoContrato {
  return (ESTADOS_CONTRATO as string[]).includes(e);
}

export function estadoTerminal(e: EstadoContrato): boolean {
  return e === "concluido" || e === "cancelado";
}

// Transições VÁLIDAS. Só a linha do tempo natural + saídas de exceção. O
// cancelamento é possível de qualquer estado ANTES do embarque (depois de embarcar
// não se "cancela" — vira acerto/outro fluxo). Visto negado volta a documentação
// (reaplicação/troca de destino) — o fluxo E1 mora em visto-service.
const TRANSICOES: Record<EstadoContrato, EstadoContrato[]> = {
  proposta_enviada: ["entrada_paga", "proposta_expirada", "cancelado"],
  proposta_expirada: ["proposta_enviada", "cancelado"], // retrabalho do consultor
  entrada_paga: ["aguardando_contrato", "cancelado"],
  aguardando_contrato: ["matricula", "cancelado"],
  matricula: ["documentacao", "cancelado"],
  documentacao: ["visto", "pre_embarque", "cancelado"], // pre_embarque = destino isento
  visto: ["pre_embarque", "documentacao", "cancelado"], // documentacao = reaplicação
  pre_embarque: ["em_programa", "cancelado"],
  em_programa: ["retorno"],
  retorno: ["concluido"],
  concluido: [],
  cancelado: [],
};

export function proximosEstados(de: EstadoContrato): EstadoContrato[] {
  return TRANSICOES[de] ?? [];
}

export function podeTransicionar(de: EstadoContrato, para: EstadoContrato): boolean {
  if (de === para) return false;
  return (TRANSICOES[de] ?? []).includes(para);
}

// Rank da linha principal (0–8) para a derivação: pega o estado mais avançado que
// os fatos JUSTIFICAM. Terminais ficam fora do rank (tratados à parte).
const RANK: Partial<Record<EstadoContrato, number>> = {
  proposta_enviada: 0,
  entrada_paga: 1,
  aguardando_contrato: 2,
  matricula: 3,
  documentacao: 4,
  visto: 5,
  pre_embarque: 6,
  em_programa: 7,
  retorno: 8,
};
const ESTADO_POR_RANK: EstadoContrato[] = [
  "proposta_enviada",
  "entrada_paga",
  "aguardando_contrato",
  "matricula",
  "documentacao",
  "visto",
  "pre_embarque",
  "em_programa",
  "retorno",
];

export type FatosContrato = {
  agoraISO: string;
  // Terminais / exceção
  canceladoEm?: string | null;
  propostaExpirada?: boolean; // validade da proposta passou sem pagamento
  // Linha principal
  entradaPaga?: boolean; // entrada confirmada por webhook (gatilho-mestre)
  contratoAssinado?: boolean; // Zoho Sign concluído (inativo hoje)
  aceiteTermoEm?: string | null; // aceite do Termo no checkout (proxy do contrato)
  matriculaConcluida?: boolean; // ficha/matrícula da escola concluída
  documentosAprovados?: boolean; // documentos obrigatórios aprovados
  vistoStatus?: "em_analise" | "aprovado" | "negado" | null;
  destinoIsentoVisto?: boolean; // destino não exige visto (pula o estado 5)
  dataInicioISO?: string | null; // relógio de embarque (ground truth)
  dataRetornoISO?: string | null; // relógio de retorno (ground truth)
};

function dataPassou(iso: string | null | undefined, agoraISO: string): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  const agora = new Date(agoraISO).getTime();
  if (!Number.isFinite(t) || !Number.isFinite(agora)) return false;
  return t <= agora;
}

// Deriva o estado atual dos FATOS. Monotônica: retorna o estado mais avançado que
// os sinais sustentam. Terminais (cancelado / proposta expirada) têm precedência.
export function deriveEstadoContrato(f: FatosContrato): EstadoContrato {
  if (f.canceladoEm) return "cancelado";
  if (!f.entradaPaga && f.propostaExpirada) return "proposta_expirada";

  let rank = 0; // o contrato existe => proposta enviada, no mínimo

  // O pagamento da entrada é o gatilho-mestre: nada da linha do meio avança sem ele.
  if (f.entradaPaga) {
    rank = Math.max(rank, RANK.entrada_paga!);

    // Sign inativo hoje: o aceite do Termo é o sinal contratual operante.
    const assinado = !!f.contratoAssinado || !!f.aceiteTermoEm;
    if (!assinado) {
      rank = Math.max(rank, RANK.aguardando_contrato!);
    } else {
      rank = Math.max(rank, RANK.matricula!);
      if (f.matriculaConcluida) rank = Math.max(rank, RANK.documentacao!);
      if (f.documentosAprovados) {
        rank = Math.max(rank, f.destinoIsentoVisto ? RANK.pre_embarque! : RANK.visto!);
      }
      if (f.vistoStatus === "aprovado") rank = Math.max(rank, RANK.pre_embarque!);
      else if (f.vistoStatus === "em_analise") rank = Math.max(rank, RANK.visto!);
    }
  }

  // Relógios são ground truth da operação: se a viagem começou/terminou, o estado
  // avança mesmo que sinais da linha do meio faltem (contratos vindos do CRM).
  if (dataPassou(f.dataInicioISO, f.agoraISO)) rank = Math.max(rank, RANK.em_programa!);
  if (dataPassou(f.dataRetornoISO, f.agoraISO)) rank = Math.max(rank, RANK.retorno!);

  return ESTADO_POR_RANK[rank];
}
