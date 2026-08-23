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
