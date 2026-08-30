// Motor PURO do reembolso escalonado do Anexo I (Clausula 9): a retencao em caso
// de cancelamento e ESCALONADA POR ETAPA concluida (percentual do tuition),
// SOMADA aos valores NAO RECUPERAVEIS (ja comprometidos) e o conjunto e limitado
// a um TETO (o teto incide sobre o TOTAL retido — retencao + nao recuperaveis).
// Ha DISPENSA (I.4) para os casos sem retencao percentual (ex.: culpa da escola).
// Produz a MEMORIA DE CALCULO (linha a linha) para a Area do Cliente e o admin.
//
// SEM imports (nem "@/..." nem extensao): roda no runner nativo do Node. Puro e
// deterministico. Nao decide dinheiro nem grava — apenas calcula e itemiza.
//
// [colchetes] — os MARCOS das etapas, os PERCENTUAIS (1/2/3,5/5%) e o TETO (800)
// sao decisoes do juridico/financeiro. Ficam como CONFIG por instancia (TENANT),
// nunca cravados na regra: os defaults abaixo sao ponto de partida a confirmar.

export type EtapaRetencao = { chave: string; rotulo: string; percentual: number };

// Escalonamento padrao (a CONFIRMAR pelo juridico) mapeado ao ciclo do contrato.
export const ETAPAS_ANEXO_I_PADRAO: EtapaRetencao[] = [
  { chave: "assinatura", rotulo: "Após a assinatura", percentual: 0.01 },
  { chave: "entrada", rotulo: "Após o pagamento da Entrada", percentual: 0.02 },
  { chave: "loa", rotulo: "Após a emissão da carta de aceite (LOA)", percentual: 0.035 },
  { chave: "visto_embarque", rotulo: "Após o visto / início do programa", percentual: 0.05 },
];

// Teto da retencao (na moeda de referencia). [colchetes] — confirmar valor/moeda.
export const TETO_RETENCAO_PADRAO = 800;

export type ReembolsoInput = {
  moeda: string;
  tuition: number; // base da retencao (componente de programa/tuition)
  etapaChave: string | null; // etapa CONCLUIDA (null = nenhuma -> sem retencao percentual)
  totalPago: number; // ja amortizado na moeda
  naoRecuperaveis?: number; // valores nao recuperaveis (application/placement fee, deposito remetido)
  teto?: number; // teto do TOTAL retido (default TETO_RETENCAO_PADRAO)
  dispensaRetencao?: boolean; // I.4: dispensa a retencao percentual (nao os nao-recuperaveis)
  etapas?: EtapaRetencao[]; // config (default ETAPAS_ANEXO_I_PADRAO)
};

export type LinhaMemoria = { rotulo: string; valor: number; tipo: "moeda" | "pct" };

export type ReembolsoResultado = {
  moeda: string;
  etapa: EtapaRetencao | null;
  dispensada: boolean;
  retencaoPercentual: number;
  retencaoBruta: number; // percentual x tuition
  naoRecuperaveis: number;
  subtotalRetido: number; // retencaoBruta + naoRecuperaveis (antes do teto)
  tetoAtingido: boolean; // subtotalRetido > teto
  totalRetido: number; // min(subtotalRetido, teto) — o teto incide sobre o TOTAL
  totalPago: number;
  reembolso: number; // max(0, totalPago - totalRetido) — a devolver ao cliente
  aindaDevido: number; // max(0, totalRetido - totalPago) — se pagou menos que o retido
  memoria: LinhaMemoria[];
};

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}
function naoNeg(n: number): number {
  return n > 0 ? n : 0;
}

export function calcularReembolsoEscalonado(input: ReembolsoInput): ReembolsoResultado {
  const moeda = input.moeda || "BRL";
  const etapas = input.etapas && input.etapas.length ? input.etapas : ETAPAS_ANEXO_I_PADRAO;
  const teto = input.teto != null ? input.teto : TETO_RETENCAO_PADRAO;
  const dispensada = !!input.dispensaRetencao;
  const tuition = naoNeg(round2(input.tuition));
  const totalPago = naoNeg(round2(input.totalPago));
  const naoRecuperaveis = naoNeg(round2(input.naoRecuperaveis ?? 0));

  const etapa = input.etapaChave ? etapas.find((e) => e.chave === input.etapaChave) ?? null : null;
  const retencaoPercentual = dispensada ? 0 : etapa ? etapa.percentual : 0;
  const retencaoBruta = round2(tuition * retencaoPercentual);

  // O teto incide sobre o TOTAL retido (retencao escalonada + nao recuperaveis).
  const subtotalRetido = round2(retencaoBruta + naoRecuperaveis);
  const tetoAtingido = teto != null && subtotalRetido > teto;
  const totalRetido = teto != null ? Math.min(subtotalRetido, teto) : subtotalRetido;

  const reembolso = round2(naoNeg(totalPago - totalRetido));
  const aindaDevido = round2(naoNeg(totalRetido - totalPago));

  const memoria: LinhaMemoria[] = [];
  memoria.push({ rotulo: "Base de cálculo (tuition)", valor: tuition, tipo: "moeda" });
  if (dispensada) {
    memoria.push({ rotulo: "Retenção escalonada dispensada (Anexo I.4)", valor: 0, tipo: "moeda" });
  } else {
    memoria.push({
      rotulo: `Retenção da etapa${etapa ? " — " + etapa.rotulo : ""}`,
      valor: retencaoPercentual,
      tipo: "pct",
    });
    memoria.push({ rotulo: "Retenção escalonada", valor: retencaoBruta, tipo: "moeda" });
  }
  if (naoRecuperaveis > 0) {
    memoria.push({ rotulo: "Valores não recuperáveis", valor: naoRecuperaveis, tipo: "moeda" });
  }
  // Subtotal so aparece quando ha mais de um componente somando.
  if (!dispensada && retencaoBruta > 0 && naoRecuperaveis > 0) {
    memoria.push({ rotulo: "Subtotal a reter", valor: subtotalRetido, tipo: "moeda" });
  }
  if (tetoAtingido) {
    memoria.push({ rotulo: `Limitado ao teto (${moeda} ${teto})`, valor: totalRetido, tipo: "moeda" });
  }
  memoria.push({ rotulo: "Total retido", valor: totalRetido, tipo: "moeda" });
  memoria.push({ rotulo: "Total pago pelo cliente", valor: totalPago, tipo: "moeda" });
  if (aindaDevido > 0) {
    memoria.push({ rotulo: "Saldo ainda devido pelo cliente", valor: aindaDevido, tipo: "moeda" });
  } else {
    memoria.push({ rotulo: "Reembolso ao cliente", valor: reembolso, tipo: "moeda" });
  }

  return {
    moeda,
    etapa,
    dispensada,
    retencaoPercentual,
    retencaoBruta,
    naoRecuperaveis,
    subtotalRetido,
    tetoAtingido,
    totalRetido,
    totalPago,
    reembolso,
    aindaDevido,
    memoria,
  };
}
