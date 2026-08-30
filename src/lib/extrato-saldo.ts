// Motor PURO do Extrato de Saldo Devedor (Clausulas 6.8 / 7.12): a divida vive
// na moeda do programa (6.3); o extrato mostra os MOVIMENTOS em ordem (a
// contratacao como abertura + cada pagamento com sua cotacao/VET e amortizacao),
// o saldo CORRENTE apos cada movimento, e o resumo — saldo na moeda, valor de
// quitacao hoje (cotacao do dia) e a proximidade da data-limite (marcos D-30/
// D-15/D-5). Nao decide dinheiro: apenas organiza dados ja apurados.
//
// SEM imports (nem "@/..." nem extensao): roda no runner nativo do Node.
// Deterministico e testavel.

export type MovimentoInput = {
  data: string; // ISO (data do pagamento)
  descricao: string;
  amortizacaoMoeda: number; // amortizado na moeda do programa
  cotacao: number | null; // VET aplicada na conversao
  valorBRL: number | null; // R$ efetivamente pago
  saldoFrozen?: number | null; // saldo AUTORITATIVO congelado apos este pagamento (pagamentos.saldo_apos_moeda)
};

export type ExtratoInput = {
  moeda: string;
  valorTotal: number; // obrigacao inicial na moeda (abertura)
  dataAbertura: string | null; // ISO (criacao do contrato/aceite — nao o inicio do programa)
  dataLimiteQuitacao: string | null; // ISO (D-30 do inicio)
  hojeISO: string; // ISO (YYYY-MM-DD)
  cotacaoHoje: number | null; // VET do dia
  saldoAtualMoeda: number; // saldo AUTORITATIVO (parcelas nao pagas)
  pagamentos: MovimentoInput[]; // cronologico ascendente
};

export type MarcoQuitacao = "D-30" | "D-15" | "D-5" | "vencido" | null;

export type ExtratoMovimento = {
  data: string;
  descricao: string;
  tipo: "contratacao" | "pagamento";
  amortizacaoMoeda: number | null;
  cotacao: number | null;
  valorBRL: number | null;
  saldoAposMoeda: number;
};

export type ExtratoSaldo = {
  resumo: {
    moeda: string;
    saldoMoeda: number;
    quitado: boolean;
    quitarHojeBRL: number | null;
    cotacaoHoje: number | null;
    dataLimite: string | null;
    diasRestantes: number | null;
    marco: MarcoQuitacao;
  };
  movimentos: ExtratoMovimento[];
};

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

// Diferenca em dias (b - a) por data ISO (YYYY-MM-DD), em UTC. Positivo = b no
// futuro. Retorna null se alguma data for invalida.
export function diasEntre(aISO: string, bISO: string): number | null {
  const a = Date.parse((aISO || "").slice(0, 10) + "T00:00:00Z");
  const b = Date.parse((bISO || "").slice(0, 10) + "T00:00:00Z");
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86400000);
}

export function marcoDe(diasRestantes: number | null): MarcoQuitacao {
  if (diasRestantes == null) return null;
  if (diasRestantes < 0) return "vencido";
  if (diasRestantes <= 5) return "D-5";
  if (diasRestantes <= 15) return "D-15";
  if (diasRestantes <= 30) return "D-30";
  return null;
}

export function montarExtratoSaldo(input: ExtratoInput): ExtratoSaldo {
  const valorTotal = round2(input.valorTotal);
  const saldoAtual = round2(input.saldoAtualMoeda);
  const quitado = saldoAtual <= 0;

  // Abertura: a contratacao estabelece a divida inicial na moeda. A data e a da
  // ABERTURA do contrato (created_at/aceite), nao o inicio do programa — senao a
  // abertura ficaria depois dos pagamentos na cronologia.
  const movimentos: ExtratoMovimento[] = [];
  const dataAbertura = input.dataAbertura || (input.pagamentos[0]?.data ?? input.hojeISO);
  movimentos.push({
    data: dataAbertura,
    descricao: "Contratação",
    tipo: "contratacao",
    amortizacaoMoeda: null,
    cotacao: null,
    valorBRL: null,
    saldoAposMoeda: valorTotal,
  });

  // Cada pagamento amortiza o saldo (na moeda). Preferimos o saldo AUTORITATIVO
  // congelado no pagamento (saldoFrozen) — evita divergir do resumo em antecipacao
  // com desconto ou alteracao de escopo (E3); na ausencia, deriva por subtracao.
  // O saldo corrente nunca fica negativo.
  let corrente = valorTotal;
  for (const p of input.pagamentos) {
    if (p.saldoFrozen != null && Number.isFinite(p.saldoFrozen)) {
      corrente = round2(Math.max(0, p.saldoFrozen));
    } else {
      corrente = round2(Math.max(0, corrente - (Number(p.amortizacaoMoeda) || 0)));
    }
    movimentos.push({
      data: p.data,
      descricao: p.descricao,
      tipo: "pagamento",
      amortizacaoMoeda: round2(p.amortizacaoMoeda),
      cotacao: p.cotacao != null ? p.cotacao : null,
      valorBRL: p.valorBRL != null ? round2(p.valorBRL) : null,
      saldoAposMoeda: corrente,
    });
  }

  const diasRestantes = input.dataLimiteQuitacao ? diasEntre(input.hojeISO, input.dataLimiteQuitacao) : null;
  const quitarHojeBRL = quitado
    ? 0
    : input.cotacaoHoje != null
      ? round2(saldoAtual * input.cotacaoHoje)
      : null;

  return {
    resumo: {
      moeda: input.moeda,
      saldoMoeda: saldoAtual,
      quitado,
      quitarHojeBRL,
      cotacaoHoje: input.cotacaoHoje != null ? input.cotacaoHoje : null,
      dataLimite: input.dataLimiteQuitacao,
      diasRestantes: quitado ? null : diasRestantes,
      marco: quitado ? null : marcoDe(diasRestantes),
    },
    movimentos,
  };
}
