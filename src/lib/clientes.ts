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
};

function centavos(v: number): number {
  return Math.round(v * 100) / 100;
}

// Agrega a carteira: uma linha por titular (inclusive titulares sem contrato),
// com contagem de contratos, destinos/estudantes distintos, progresso das
// parcelas (pagas/total), parcelas em atraso e saldo em aberto por moeda.
// `hojeISO` (YYYY-MM-DD) define o corte de atraso: nao paga e vencida.
export function agruparCarteira(
  titulares: TitularInput[],
  contratos: ContratoInput[],
  parcelas: ParcelaInput[],
  hojeISO: string
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
    });
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
