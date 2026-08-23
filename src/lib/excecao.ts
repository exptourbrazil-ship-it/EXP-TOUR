// Modelo de PROCESSOS DE EXCECAO (doc 01, Secao 4). PURO (sem rede/DB), para
// ser testado sem mocks e reutilizado por rotas, servico e UI.
//
// Principio arquitetural: uma excecao NAO e um estado da linha principal da
// jornada; e um processo paralelo, com maquina propria, que ao abrir pode
// SUSPENDER partes do motor (cobranca, lembretes, avanco) e ao fechar retoma,
// redireciona ou encerra a jornada. Enquanto ha uma excecao aberta num
// contrato, o "processo ativo" e ela.
//
// Este modulo define o vocabulario (tipos E1..E11, estados, dominios de
// suspensao), a maquina de estados e os helpers puros de suspensao. A
// automacao ESPECIFICA de cada tipo (E1 pausa a regua e abre tarefa, E4 dispara
// refund etc.) e um item por tipo, construido depois sobre este framework.

// ---- Dominios que uma excecao pode suspender -------------------------------
// Sao as partes do motor que um processo paralelo congela enquanto esta aberto.
export const DOMINIOS_SUSPENSAO = ["cobranca", "lembretes", "avanco"] as const;
export type DominioSuspensao = (typeof DOMINIOS_SUSPENSAO)[number];

export function dominioSuspensaoValido(d: unknown): d is DominioSuspensao {
  return typeof d === "string" && (DOMINIOS_SUSPENSAO as readonly string[]).includes(d);
}

// Normaliza uma lista de dominios vinda de fora (body de rota, jsonb do banco):
// mantem so os validos, sem repeticao, na ordem canonica.
export function sanitizarSuspensoes(entrada: unknown): DominioSuspensao[] {
  const arr = Array.isArray(entrada) ? entrada : [];
  return DOMINIOS_SUSPENSAO.filter((d) => arr.includes(d));
}

// ---- Catalogo de tipos de excecao (E1..E11 do doc 01, Secao 4) -------------
export type OrigemExcecao = "manual" | "automatica" | "ambas";

export type TipoExcecao = {
  codigo: string; // E1..E11 (referencia ao doc)
  valor: string; // slug estavel gravado no banco
  label: string;
  // Como e tipicamente aberta: por acao humana, pelo sistema (webhook/relogio)
  // ou ambas. So um rotulo de intencao — nao bloqueia a abertura manual.
  origem: OrigemExcecao;
  // Suspensoes padrao ao abrir. O operador pode ajustar no ato da abertura.
  suspendePadrao: DominioSuspensao[];
  // Papel-alvo na Fila do Dia (quem conduz este processo) e SLA em dias para o
  // envelhecimento (doc 07 §1: "exceções abertas ... com idade"). Defaults v1;
  // TODO: mover para config por instancia (TENANT), como os demais parametros.
  papelAlvo: string;
  slaDias: number;
};

export const TIPOS_EXCECAO: TipoExcecao[] = [
  {
    codigo: "E1",
    valor: "visto_negado",
    label: "Visto negado",
    origem: "ambas",
    suspendePadrao: ["cobranca", "lembretes"],
    papelAlvo: "consultor",
    slaDias: 1, // contato em 24h
  },
  {
    codigo: "E2",
    valor: "deferral_inicio",
    label: "Adiamento de início (deferral)",
    origem: "manual",
    suspendePadrao: ["avanco"],
    papelAlvo: "operacao",
    slaDias: 3,
  },
  {
    codigo: "E3",
    valor: "alteracao_escopo",
    label: "Alteração de escopo (extensão, upgrade, troca)",
    origem: "manual",
    suspendePadrao: [],
    papelAlvo: "operacao",
    slaDias: 3,
  },
  {
    codigo: "E4",
    valor: "cancelamento_cliente",
    label: "Cancelamento pelo cliente",
    origem: "manual",
    suspendePadrao: ["cobranca", "lembretes"],
    papelAlvo: "consultor", // conversa de retencao antes do acerto
    slaDias: 1,
  },
  {
    codigo: "E5",
    valor: "cancelamento_inadimplencia",
    label: "Cancelamento por inadimplência",
    origem: "ambas",
    // Ao escalar (D+30 -> rescisao formal), a cobranca automatica cede lugar ao
    // processo formal: pausa lembretes/regua enquanto o E5 corre.
    suspendePadrao: ["cobranca", "lembretes"],
    papelAlvo: "financeiro",
    slaDias: 2,
  },
  {
    codigo: "E6",
    valor: "cancelamento_escola",
    label: "Cancelamento pela escola",
    origem: "ambas",
    suspendePadrao: ["cobranca", "lembretes"],
    papelAlvo: "operacao",
    slaDias: 1,
  },
  {
    codigo: "E7",
    valor: "interrupcao_programa",
    label: "Interrupção durante o programa",
    origem: "ambas",
    suspendePadrao: ["cobranca", "lembretes", "avanco"],
    papelAlvo: "operacao",
    slaDias: 1,
  },
  {
    codigo: "E8",
    valor: "forca_maior",
    label: "Força maior coletiva",
    origem: "ambas",
    suspendePadrao: ["cobranca", "lembretes"],
    papelAlvo: "operacao",
    slaDias: 1,
  },
  {
    codigo: "E9",
    valor: "disputa_pagamento",
    label: "Contestação de pagamento (MED Pix / chargeback)",
    origem: "automatica",
    suspendePadrao: ["avanco"],
    papelAlvo: "financeiro",
    slaDias: 1,
  },
  {
    codigo: "E10",
    valor: "suspeita_fraude",
    label: "Suspeita de fraude (hold de verificação)",
    origem: "ambas",
    suspendePadrao: ["avanco"],
    papelAlvo: "operacao",
    slaDias: 1,
  },
  {
    codigo: "E11",
    valor: "incontactavel",
    label: "Cliente incontactável / pendência eterna",
    origem: "ambas",
    suspendePadrao: [],
    papelAlvo: "operacao",
    slaDias: 2,
  },
];

export function tipoExcecao(valor: string): TipoExcecao | undefined {
  return TIPOS_EXCECAO.find((t) => t.valor === valor);
}

export function tipoExcecaoValido(valor: unknown): valor is string {
  return typeof valor === "string" && TIPOS_EXCECAO.some((t) => t.valor === valor);
}

export function labelTipoExcecao(valor: string): string {
  return tipoExcecao(valor)?.label ?? valor;
}

// Suspensoes padrao de um tipo (copia, para o chamador poder ajustar sem mutar
// o catalogo).
export function suspendePadraoDoTipo(valor: string): DominioSuspensao[] {
  return [...(tipoExcecao(valor)?.suspendePadrao ?? [])];
}

// Papel-alvo e SLA de um tipo, com fallback seguro para tipos desconhecidos
// (operacao conduz por padrao; SLA de 2 dias). Usados pela Fila do Dia.
export function papelAlvoDoTipo(valor: string): string {
  return tipoExcecao(valor)?.papelAlvo ?? "operacao";
}

export function slaDiasDoTipo(valor: string): number {
  return tipoExcecao(valor)?.slaDias ?? 2;
}

// ---- Maquina de estados -----------------------------------------------------
export const STATUS_EXCECAO = ["aberta", "em_andamento", "resolvida", "cancelada"] as const;
export type StatusExcecao = (typeof STATUS_EXCECAO)[number];

// Estados que encerram o processo (nao suspendem mais nada; nao aceitam avanco,
// exceto reabrir uma resolvida).
const STATUS_TERMINAIS: ReadonlySet<StatusExcecao> = new Set(["resolvida", "cancelada"]);

export function ehStatusTerminal(s: StatusExcecao): boolean {
  return STATUS_TERMINAIS.has(s);
}

// Uma excecao "ativa" e a que ainda pesa sobre o caso (nao terminal).
export function excecaoAtiva(status: StatusExcecao): boolean {
  return !ehStatusTerminal(status);
}

// Transicoes permitidas. resolvida -> em_andamento e o "reabrir" (correcao de
// um fechamento precoce); cancelada e definitivo.
const TRANSICOES: Record<StatusExcecao, readonly StatusExcecao[]> = {
  aberta: ["em_andamento", "resolvida", "cancelada"],
  em_andamento: ["aberta", "resolvida", "cancelada"],
  resolvida: ["em_andamento"],
  cancelada: [],
};

export function transicaoPermitida(de: StatusExcecao, para: StatusExcecao): boolean {
  if (de === para) return false;
  return TRANSICOES[de]?.includes(para) ?? false;
}

// Desfecho de uma resolucao: como a jornada principal continua (doc 01 §4:
// "retoma, redireciona ou encerra").
export const DESFECHOS_EXCECAO = ["retomada", "redirecionamento", "encerramento"] as const;
export type DesfechoExcecao = (typeof DESFECHOS_EXCECAO)[number];

export function desfechoValido(d: unknown): d is DesfechoExcecao {
  return typeof d === "string" && (DESFECHOS_EXCECAO as readonly string[]).includes(d);
}

// ---- Suspensao efetiva sobre um caso ---------------------------------------
// Dado o conjunto de excecoes de um contrato, quais dominios estao suspensos
// AGORA — a uniao das suspensoes das excecoes ATIVAS (nao terminais). Excecoes
// resolvidas/canceladas nao suspendem nada: ao fechar, a jornada retoma.
type ExcecaoParaSuspensao = { status: StatusExcecao; suspende: unknown };

export function dominiosSuspensos(excecoes: ExcecaoParaSuspensao[]): DominioSuspensao[] {
  const ativos = new Set<DominioSuspensao>();
  for (const e of excecoes) {
    if (!excecaoAtiva(e.status)) continue;
    for (const d of sanitizarSuspensoes(e.suspende)) ativos.add(d);
  }
  return DOMINIOS_SUSPENSAO.filter((d) => ativos.has(d));
}

export function estaSuspenso(excecoes: ExcecaoParaSuspensao[], dominio: DominioSuspensao): boolean {
  return dominiosSuspensos(excecoes).includes(dominio);
}

// Dado um lote de excecoes de VARIOS contratos, devolve o conjunto de
// contrato_id que tem ALGUM dos `dominios` suspenso por uma excecao ativa.
// Usado por consumidores da suspensao (ex.: a regua de cobranca pula os
// contratos suspensos numa unica passada, sem consultar excecao por contrato).
type ExcecaoDeContrato = { contrato_id: string; status: StatusExcecao; suspende: unknown };

export function contratosComSuspensao(
  excecoes: ExcecaoDeContrato[],
  dominios: DominioSuspensao[]
): Set<string> {
  const alvo = new Set<DominioSuspensao>(dominios);
  const out = new Set<string>();
  for (const e of excecoes) {
    if (!excecaoAtiva(e.status)) continue;
    for (const d of sanitizarSuspensoes(e.suspende)) {
      if (alvo.has(d)) {
        out.add(e.contrato_id);
        break;
      }
    }
  }
  return out;
}
