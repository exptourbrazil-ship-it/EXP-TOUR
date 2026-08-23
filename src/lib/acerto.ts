// Motor de ACERTO (cancelamento/alteracao) — PURO (sem rede/DB), testavel. Dado
// o valor do programa, o total ja pago e o momento da jornada, calcula a
// retencao/multa, o saldo a devolver ao cliente e a MEMORIA DE CALCULO (linhas
// explicaveis). Ver doc 01 §4 (E4/E5/E6/E7) e doc 07 §3.5.
//
// IMPORTANTE: as faixas de retencao aqui sao PLACEHOLDER — pendentes de
// validacao juridica (cláusulas de acerto). O motor e parametrizado: as faixas
// reais entram por config por instancia (TENANT) sem tocar este codigo. A
// memoria sempre marca `provisorio: true` enquanto a config real nao existir.
//
// Este passo calcula e registra um RASCUNHO para o Financeiro revisar. NAO
// propoe ao cliente, NAO coleta aceite e NAO executa refund (dinheiro so muda
// por webhook confirmado; execucao e um marco proprio).

export type FaixaRetencao = { minDiasAteInicio: number; percentual: number };

// Placeholder v1 (a validar juridicamente): quanto mais perto do inicio, maior a
// retencao. Ordenado do maior minDias para o menor.
export const RETENCAO_PLACEHOLDER: FaixaRetencao[] = [
  { minDiasAteInicio: 60, percentual: 0.1 }, // 60+ dias antes do inicio
  { minDiasAteInicio: 30, percentual: 0.25 }, // 30-59 dias
  { minDiasAteInicio: 0, percentual: 0.5 }, // 0-29 dias
];

// Tipos de excecao que NAO geram multa ao cliente (a culpa nao e dele): escola
// cancelou (E6). Arrependimento <=7 dias tambem e refund integral, mas isso
// depende da data de compra (nao do inicio) — tratado pelo revisor/override, nao
// aqui. Default (placeholder); a config por instancia pode sobrescrever a lista.
export const TIPOS_SEM_RETENCAO_PADRAO: string[] = ["cancelamento_escola"];

function round2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

// Determina o percentual de retencao a partir do tipo + dias ate o inicio.
// diasAteInicio negativo (programa ja iniciado) usa a faixa mais alta. As faixas
// e a lista de tipos-sem-retencao vem da CONFIG por instancia (ver
// carregarConfigRetencao); os defaults aqui sao so o fallback placeholder.
export function determinarRetencaoPercentual(
  tipo: string,
  diasAteInicio: number,
  faixas: FaixaRetencao[] = RETENCAO_PLACEHOLDER,
  tiposSemRetencao: string[] = TIPOS_SEM_RETENCAO_PADRAO
): number {
  if (tiposSemRetencao.includes(tipo)) return 0;
  const ordenadas = [...faixas].sort((a, b) => b.minDiasAteInicio - a.minDiasAteInicio);
  for (const f of ordenadas) {
    if (diasAteInicio >= f.minDiasAteInicio) return f.percentual;
  }
  // Abaixo de todas as faixas (ex.: ja iniciado, diasAteInicio < menor minDias):
  // aplica a faixa mais restritiva (maior percentual).
  return ordenadas.length ? ordenadas[ordenadas.length - 1].percentual : 0;
}

// Valida um conjunto de faixas de retencao vindo da config (entrada do gestor).
// Puro/testavel: garante lista nao-vazia de {minDiasAteInicio>=0, percentual 0..1}.
export function validarFaixasRetencao(faixas: unknown): { ok: boolean; motivo?: string } {
  if (!Array.isArray(faixas) || faixas.length === 0) {
    return { ok: false, motivo: "faixas_vazias" };
  }
  for (const f of faixas) {
    const min = (f as FaixaRetencao)?.minDiasAteInicio;
    const pct = (f as FaixaRetencao)?.percentual;
    if (typeof min !== "number" || !Number.isFinite(min) || min < 0) {
      return { ok: false, motivo: "minDiasAteInicio_invalido" };
    }
    if (typeof pct !== "number" || !Number.isFinite(pct) || pct < 0 || pct > 1) {
      return { ok: false, motivo: "percentual_invalido" };
    }
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Ciclo de vida do acerto (Fatia B): rascunho -> proposto -> aceito -> executado
// ---------------------------------------------------------------------------
export const STATUS_ACERTO = ["rascunho", "proposto", "aceito", "executado", "cancelado"] as const;
export type StatusAcerto = (typeof STATUS_ACERTO)[number];

// Transicoes permitidas (so avancam; executado/cancelado sao terminais).
const TRANSICOES_ACERTO: Record<string, string[]> = {
  rascunho: ["proposto", "cancelado"],
  proposto: ["aceito", "cancelado"],
  aceito: ["executado", "cancelado"],
  executado: [],
  cancelado: [],
};

export function transicaoAcertoPermitida(de: string, para: string): boolean {
  return (TRANSICOES_ACERTO[de] || []).includes(para);
}

export type EntradaAcerto = {
  valorTotal: number; // valor do programa (moeda do contrato)
  totalPago: number; // total ja pago pelo cliente (mesma moeda)
  retencaoPercentual: number; // 0..1
  refundEscolaEsperado?: number; // informacional (tesouraria); default 0
};

export type LinhaMemoria = { rotulo: string; valor: number; tipo: "info" | "debito" | "credito" };

export type Acerto = {
  retencaoPercentual: number;
  retencaoValor: number;
  saldoDevolverCliente: number;
  refundEscolaEsperado: number;
  memoria: LinhaMemoria[];
};

// Calcula o acerto e monta a memoria. Retencao = valorTotal * percentual (multa);
// o cliente recebe de volta o que pagou menos a retencao, nunca negativo (nao se
// cobra a mais no cancelamento). O refund esperado da escola e informacional
// (recuperacao da empresa), nao entra no saldo do cliente.
export function calcularAcerto(e: EntradaAcerto): Acerto {
  const valorTotal = round2(e.valorTotal);
  const totalPago = round2(e.totalPago);
  const pct = Math.min(1, Math.max(0, e.retencaoPercentual || 0));
  const refundEscola = round2(e.refundEscolaEsperado || 0);

  const retencaoValor = round2(valorTotal * pct);
  const saldoDevolverCliente = Math.max(0, round2(totalPago - retencaoValor));

  const memoria: LinhaMemoria[] = [
    { rotulo: "Valor total do programa", valor: valorTotal, tipo: "info" },
    { rotulo: "Total pago pelo cliente", valor: totalPago, tipo: "info" },
    {
      rotulo: `Retenção contratual (${round2(pct * 100)}%)`,
      valor: retencaoValor,
      tipo: "debito",
    },
    { rotulo: "Saldo a devolver ao cliente", valor: saldoDevolverCliente, tipo: "credito" },
    {
      rotulo: "Refund esperado da escola (tesouraria)",
      valor: refundEscola,
      tipo: "info",
    },
  ];

  return {
    retencaoPercentual: pct,
    retencaoValor,
    saldoDevolverCliente,
    refundEscolaEsperado: refundEscola,
    memoria,
  };
}

// ---------------------------------------------------------------------------
// ACERTO DE CREDITO POR ALTERACAO DE ESCOPO (E3 downgrade)
// ---------------------------------------------------------------------------
// Diferente do cancelamento: NAO ha retencao/multa (o cliente nao desiste, so
// reduz o escopo). O credito a devolver e o que ele pagou A MAIS do que o novo
// valor do programa: max(0, ja pago - novo valor). Puro/testavel; a execucao do
// refund (dinheiro saindo) continua deferida (motor de acerto, fatias 2+).
export type AcertoCredito = {
  valorProgramaNovo: number;
  totalPago: number;
  creditoDevolver: number;
  memoria: LinhaMemoria[];
};

// Renderiza o texto do TERMO DE ACERTO a partir da memoria de calculo. PURO e
// determinístico (sem data/hora) para que o hash SHA-256 seja estavel e sirva de
// prova do que o cliente aceitou. O hash em si e calculado por calcularHashTermo
// (lib/termos.ts) sobre esta string.
export function renderizarTermoAcerto(d: {
  moeda: string;
  memoria: LinhaMemoria[];
  saldoDevolverCliente: number;
  provisorio: boolean;
}): string {
  const moeda = (d.moeda || "").toUpperCase() || "BRL";
  const fmt = (v: number) => `${moeda} ${round2(v).toFixed(2)}`;
  const linhas = (d.memoria || []).map((l) => `- ${l.rotulo}: ${fmt(Number(l.valor) || 0)}`);
  const partes = [
    "TERMO DE ACERTO",
    "",
    "Memoria de calculo:",
    ...linhas,
    "",
    `Valor a devolver ao cliente: ${fmt(d.saldoDevolverCliente)}`,
  ];
  if (d.provisorio) {
    partes.push(
      "",
      "Observacao: valores provisorios ate a validacao final das clausulas de retencao."
    );
  }
  return partes.join("\n");
}

// ---------------------------------------------------------------------------
// FATIA C: planejamento do refund (estorno via MP) — PURO
// ---------------------------------------------------------------------------
// Meio decidido (plano §1.3): estorno via Mercado Pago do(s) pagamento(s)
// original(is), em BRL, com fallback manual. O credito e calculado na moeda do
// programa; o refund devolve a MESMA FRACAO em BRL do que foi pago:
//   refundBRL = totalPagoBRL * (saldoDevolver / totalPago)   [ambos na moeda]
// particionada entre os pagamentos (do mais recente ao mais antigo). Cai no
// FALLBACK MANUAL (nada de estorno automatico) quando ha pagamento em disputa,
// fora da janela do MP, ou sem pagamentos no ledger.

export const DEFAULT_JANELA_REFUND_DIAS = 90; // confirmar o limite real do MP (plano §6.5)

export type PagamentoRefund = {
  id: string;
  externalPaymentId: string | null;
  valorBRL: number;
  emDisputa?: boolean;
  pagoEmISO: string; // YYYY-MM-DD (ou ISO completo)
};

export type ItemRefund = { pagamentoId: string; externalPaymentId: string | null; valorBRL: number };

export type PlanoRefund = {
  refundBRL: number;
  meio: "mp" | "manual";
  motivoManual: string | null;
  itens: ItemRefund[];
};

function diasEntreISO(aISO: string, bISO: string): number {
  const a = Date.parse((aISO || "").slice(0, 10) + "T00:00:00Z");
  const b = Date.parse((bISO || "").slice(0, 10) + "T00:00:00Z");
  // Data invalida/ausente => trata como MUITO antiga (fora da janela -> manual),
  // nunca como "dentro da janela". Defensivo para a execucao (Fatia D).
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Number.POSITIVE_INFINITY;
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

export function planejarRefund(args: {
  saldoDevolver: number; // moeda do programa
  totalPago: number; // moeda do programa
  pagamentos: PagamentoRefund[];
  hojeISO: string;
  janelaDias?: number;
}): PlanoRefund {
  const janela = args.janelaDias ?? DEFAULT_JANELA_REFUND_DIAS;
  const pagamentos = Array.isArray(args.pagamentos) ? args.pagamentos : [];
  const saldo = round2(args.saldoDevolver);
  const totalPago = round2(args.totalPago);
  const totalPagoBRLcents = pagamentos.reduce(
    (s, p) => s + Math.round((Number(p.valorBRL) || 0) * 100),
    0
  );

  // Nada a devolver: acerto sem saldo/base — nao e manual, e vazio.
  if (saldo <= 0 || totalPago <= 0) {
    return { refundBRL: 0, meio: "mp", motivoManual: null, itens: [] };
  }
  // Ha saldo a devolver, mas nenhum BRL pago no ledger (nada para estornar via
  // MP) -> devolucao MANUAL. (Antes caia no return "mp R$0", escondendo o caso.)
  if (totalPagoBRLcents <= 0) {
    return { refundBRL: 0, meio: "manual", motivoManual: "sem_pagamentos", itens: [] };
  }

  const fracao = Math.min(1, saldo / totalPago);
  const refundCents = Math.round(totalPagoBRLcents * fracao);
  const refundBRL = Math.round(refundCents) / 100;

  // Elegibilidade do estorno automatico: qualquer pagamento em disputa, fora da
  // janela, ou sem external_payment_id -> o refund inteiro cai no manual.
  let motivoManual: string | null = null;
  if (pagamentos.length === 0) motivoManual = "sem_pagamentos";
  else if (pagamentos.some((p) => p.emDisputa)) motivoManual = "em_disputa";
  else if (pagamentos.some((p) => !p.externalPaymentId)) motivoManual = "sem_external_id";
  else if (pagamentos.some((p) => diasEntreISO(p.pagoEmISO, args.hojeISO) > janela))
    motivoManual = "fora_da_janela";

  if (motivoManual) {
    return { refundBRL, meio: "manual", motivoManual, itens: [] };
  }

  // Particiona em centavos (soma exata): do mais recente ao mais antigo.
  const ordenados = [...pagamentos].sort((a, b) => (a.pagoEmISO < b.pagoEmISO ? 1 : -1));
  let restante = refundCents;
  const itens: ItemRefund[] = [];
  for (const p of ordenados) {
    if (restante <= 0) break;
    const disponivel = Math.round((Number(p.valorBRL) || 0) * 100);
    const take = Math.min(restante, disponivel);
    if (take > 0) {
      itens.push({
        pagamentoId: p.id,
        externalPaymentId: p.externalPaymentId,
        valorBRL: Math.round(take) / 100,
      });
      restante -= take;
    }
  }
  return { refundBRL, meio: "mp", motivoManual: null, itens };
}

export function calcularAcertoCreditoEscopo(e: {
  valorProgramaNovo: number;
  jaPago: number;
}): AcertoCredito {
  const novo = round2(e.valorProgramaNovo);
  const pago = round2(e.jaPago);
  const creditoDevolver = Math.max(0, round2(pago - novo));
  const memoria: LinhaMemoria[] = [
    { rotulo: "Valor do programa (após alteração)", valor: novo, tipo: "info" },
    { rotulo: "Total pago pelo cliente", valor: pago, tipo: "info" },
    { rotulo: "Crédito a devolver ao cliente", valor: creditoDevolver, tipo: "credito" },
  ];
  return { valorProgramaNovo: novo, totalPago: pago, creditoDevolver, memoria };
}
