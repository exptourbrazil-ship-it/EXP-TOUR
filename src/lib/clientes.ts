// Helpers PUROS (sem rede/DB) para a carteira de clientes do painel admin.
// Agregam titulares + contratos + parcelas em uma linha por titular, para
// poderem ser testados sem mocks e sem depender do relogio (a data de hoje
// entra como parametro).

export type TitularInput = {
  id: string;
  nome_completo: string | null;
  cpf: string | null;
  telefone: string | null;
  email: string | null;
  data_inicio: string | null;
};

export type ContratoInput = {
  id: string;
  titular_id: string;
  estudante_nome: string | null;
  pais_destino: string | null;
  moeda: string | null;
};

export type ParcelaInput = {
  contrato_id: string;
  status: string;
  valor_atual: number | string;
  vencimento: string; // YYYY-MM-DD
};

// Uma excecao ATIVA (nao terminal) do titular. O loader ja filtra por status
// ativo; aqui so contamos por titular, para nao acoplar clientes.ts ao enum de
// status (mantendo o modulo leaf/puro, testavel sem @/-alias).
export type ExcecaoInput = {
  titular_id: string;
};

export type ClienteCarteira = {
  id: string;
  nome: string | null;
  cpf: string | null;
  telefone: string | null;
  email: string | null;
  data_inicio: string | null;
  numContratos: number;
  destinos: string[];
  estudantes: string[];
  parcelasTotal: number;
  parcelasPagas: number;
  emAtraso: number; // parcelas nao pagas e vencidas
  saldoPorMoeda: Record<string, number>; // em aberto (nao pago), por moeda
  processosAtivos: number; // excecoes nao terminais abertas para o titular
};

function centavos(v: number): number {
  return Math.round(v * 100) / 100;
}

// Normaliza texto para busca: minusculas e SEM acentos (para "joao" achar
// "Joao"/"João"). Puro; usado pela busca do indice de clientes.
export function normalizarBusca(texto: string | null | undefined): string {
  if (!texto) return "";
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

// Agrega a carteira: uma linha por titular (inclusive titulares sem contrato),
// com contagem de contratos, destinos/estudantes distintos, progresso das
// parcelas (pagas/total), parcelas em atraso e saldo em aberto por moeda.
// `hojeISO` (YYYY-MM-DD) define o corte de atraso: nao paga e vencida.
export function agruparCarteira(
  titulares: TitularInput[],
  contratos: ContratoInput[],
  parcelas: ParcelaInput[],
  hojeISO: string,
  excecoesAtivas: ExcecaoInput[] = []
): ClienteCarteira[] {
  // Base: um acumulador por titular (garante que titular sem contrato apareca).
  const porId = new Map<string, ClienteCarteira>();
  for (const t of titulares) {
    porId.set(t.id, {
      id: t.id,
      nome: t.nome_completo,
      cpf: t.cpf,
      telefone: t.telefone,
      email: t.email,
      data_inicio: t.data_inicio,
      numContratos: 0,
      destinos: [],
      estudantes: [],
      parcelasTotal: 0,
      parcelasPagas: 0,
      emAtraso: 0,
      saldoPorMoeda: {},
      processosAtivos: 0,
    });
  }

  // Processos (excecoes) ativos por titular — ja vem filtrados pelo loader.
  for (const e of excecoesAtivas) {
    const cliente = porId.get(e.titular_id);
    if (cliente) cliente.processosAtivos += 1;
  }

  // Mapa contrato -> { titularId, moeda } para ligar as parcelas ao titular.
  const contratoInfo = new Map<string, { titularId: string; moeda: string }>();
  for (const c of contratos) {
    const cliente = porId.get(c.titular_id);
    contratoInfo.set(c.id, { titularId: c.titular_id, moeda: (c.moeda || "?").toUpperCase() });
    if (!cliente) continue; // contrato de titular fora da lista: ignora
    cliente.numContratos += 1;
    const destino = (c.pais_destino || "").trim();
    if (destino && !cliente.destinos.includes(destino)) cliente.destinos.push(destino);
    const estudante = (c.estudante_nome || "").trim();
    if (estudante && !cliente.estudantes.includes(estudante)) cliente.estudantes.push(estudante);
  }

  for (const p of parcelas) {
    const info = contratoInfo.get(p.contrato_id);
    if (!info) continue;
    const cliente = porId.get(info.titularId);
    if (!cliente) continue;

    cliente.parcelasTotal += 1;
    if (p.status === "pago") {
      cliente.parcelasPagas += 1;
      continue;
    }
    // Nao paga: entra no saldo em aberto e, se vencida, conta como atraso.
    const valor = Number(p.valor_atual) || 0;
    cliente.saldoPorMoeda[info.moeda] = centavos((cliente.saldoPorMoeda[info.moeda] || 0) + valor);
    if (p.vencimento < hojeISO) cliente.emAtraso += 1;
  }

  return Array.from(porId.values()).sort((a, b) =>
    (a.nome || "").localeCompare(b.nome || "", "pt-BR")
  );
}

// Indicadores de topo da carteira (aplicados sobre a lista COMPLETA, nao a
// filtrada): total de clientes, quantos com atraso, quantos com processo ativo
// e saldo total em aberto por moeda. Puro; a UI so formata.
export type ResumoCarteira = {
  total: number;
  comAtraso: number;
  comProcessoAtivo: number;
  saldoPorMoeda: Record<string, number>;
};

export function resumoCarteira(clientes: ClienteCarteira[]): ResumoCarteira {
  const saldoPorMoeda: Record<string, number> = {};
  let comAtraso = 0;
  let comProcessoAtivo = 0;
  for (const c of clientes) {
    if (c.emAtraso > 0) comAtraso += 1;
    if (c.processosAtivos > 0) comProcessoAtivo += 1;
    for (const [moeda, valor] of Object.entries(c.saldoPorMoeda)) {
      saldoPorMoeda[moeda] = centavos((saldoPorMoeda[moeda] || 0) + valor);
    }
  }
  return { total: clientes.length, comAtraso, comProcessoAtivo, saldoPorMoeda };
}
