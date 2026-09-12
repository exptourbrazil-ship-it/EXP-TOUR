// Motor PURO da calculadora de reembolso UNIFICADA (spec 2, seção reembolso).
// Combina, numa única memória, os componentes de retenção em caso de
// cancelamento e converte o total para BRL (reembolso ao cliente é sempre em BRL):
//
//   retenção EXP Tour (Anexo I, escalonada por ESTADO)   -- calculada na F1 do Anexo I
// + retenção do FORNECEDOR (escada por DATA, por campus)  -- calculada em politica-retencao.ts
// + valores não recuperáveis (já comprometidos)
// + remuneração por serviços (fee EXP Tour)
//   ------------------------------------------------------
// = total retido (moeda do programa) --VET(PTAX·IOF·spread)--> total retido (BRL)
//
// Decisões de negócio (confirmadas):
//  - COMBINAÇÃO = SOMA dos componentes (cada um já capado no seu motor de origem),
//    não max(estado, data): a escola retém o dela, a EXP Tour retém o dela.
//  - "<30 dias → 5%": PISO de proximidade da retenção EXP Tour — cancelou faltando
//    menos de N dias para o início, a retenção EXP Tour é no mínimo piso% do tuition.
//  - CÂMBIO: PTAX do dia do cálculo, com IOF + spread (VET), IGUAL ao resto do
//    sistema. O reembolso ao cliente é em BRL (foi o que ele pagou).
//
// SEM imports (roda no runner nativo do Node). Puro/determinístico. Recebe os
// componentes JÁ CALCULADOS (na moeda do programa) — o serviço compõe os motores
// (Anexo I + política de retenção) e passa os totais aqui.

export type LinhaMemoria = { rotulo: string; valor: number; tipo: "moeda" | "moeda_brl" | "pct" | "num" | "info" };

export type ReembolsoUnificadoInput = {
  moedaPrograma: string;
  // Componentes de retenção NA MOEDA DO PROGRAMA (já capados individualmente):
  retencaoExpTour: number; // Anexo I (etapa/estado)
  retencaoFornecedor: number; // escada do campus (soma das âncoras aplicáveis)
  naoRecuperaveis?: number; // valores comprometidos (application/placement fee, depósito remetido)
  remuneracaoServicos?: number; // fee de serviço da EXP Tour
  // Piso de proximidade da retenção EXP Tour (<pisoDias => >= piso% do tuition).
  tuition?: number; // base do piso
  diasAteInicio?: number | null; // proximidade do início
  pisoProximidadePercentual?: number; // default 0.05
  pisoProximidadeDias?: number; // default 30
  // Câmbio moeda do programa -> BRL (VET = PTAX·(1+IOF)·(1+spread)).
  cotacaoPtax: number;
  iof?: number; // fração (ex.: 0.035)
  spread?: number; // fração (ex.: 0.05)
  // Já pago pelo cliente, em BRL.
  totalPagoBRL: number;
  // Data em que a retenção AUMENTA (próximo degrau) — só para a memória.
  proximoDegrauEmISO?: string | null;
};

export type ReembolsoUnificadoResultado = {
  moedaPrograma: string;
  retencaoExpTour: number; // efetiva (após o piso), na moeda do programa
  pisoProximidadeAplicado: boolean;
  retencaoFornecedor: number;
  naoRecuperaveis: number;
  remuneracaoServicos: number;
  totalRetidoMoeda: number; // soma, na moeda do programa
  vet: number; // PTAX·(1+IOF)·(1+spread)
  totalRetidoBRL: number;
  totalPagoBRL: number;
  reembolsoBRL: number; // a devolver ao cliente
  aindaDevidoBRL: number; // se pagou menos que o retido
  memoria: LinhaMemoria[];
};

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}
function num(n: unknown): number {
  const x = Number(n);
  return Number.isFinite(x) ? x : 0;
}
function naoNeg(n: number): number {
  return n > 0 ? n : 0;
}

export function calcularReembolsoUnificado(input: ReembolsoUnificadoInput): ReembolsoUnificadoResultado {
  const moedaPrograma = input.moedaPrograma || "BRL";
  const naoRecuperaveis = naoNeg(round2(num(input.naoRecuperaveis)));
  const remuneracaoServicos = naoNeg(round2(num(input.remuneracaoServicos)));
  const retencaoFornecedor = naoNeg(round2(num(input.retencaoFornecedor)));
  const retencaoExpTourBruta = naoNeg(round2(num(input.retencaoExpTour)));

  // Piso de proximidade: <pisoDias para o início => retenção EXP Tour >= piso% do tuition.
  const pisoPct = input.pisoProximidadePercentual != null ? input.pisoProximidadePercentual : 0.05;
  const pisoDias = input.pisoProximidadeDias != null ? input.pisoProximidadeDias : 30;
  const tuition = naoNeg(round2(num(input.tuition)));
  const dentroDaProximidade =
    input.diasAteInicio != null && Number.isFinite(input.diasAteInicio) && (input.diasAteInicio as number) < pisoDias;
  const pisoValor = dentroDaProximidade ? round2(tuition * pisoPct) : 0;
  const retencaoExpTour = Math.max(retencaoExpTourBruta, pisoValor);
  const pisoProximidadeAplicado = pisoValor > retencaoExpTourBruta;

  const totalRetidoMoeda = round2(retencaoExpTour + retencaoFornecedor + naoRecuperaveis + remuneracaoServicos);

  const iof = input.iof != null ? input.iof : 0;
  const spread = input.spread != null ? input.spread : 0;
  const ptax = naoNeg(num(input.cotacaoPtax));
  const vet = round2(ptax * (1 + iof) * (1 + spread));
  const totalRetidoBRL = round2(totalRetidoMoeda * vet);

  const totalPagoBRL = naoNeg(round2(num(input.totalPagoBRL)));
  const reembolsoBRL = round2(naoNeg(totalPagoBRL - totalRetidoBRL));
  const aindaDevidoBRL = round2(naoNeg(totalRetidoBRL - totalPagoBRL));

  const memoria: LinhaMemoria[] = [];
  memoria.push({ rotulo: "Retenção EXP Tour (Anexo I)", valor: retencaoExpTourBruta, tipo: "moeda" });
  if (pisoProximidadeAplicado) {
    memoria.push({
      rotulo: `Piso de proximidade (<${pisoDias} dias) — ${Math.round(pisoPct * 100)}% do tuition`,
      valor: retencaoExpTour,
      tipo: "moeda",
    });
  }
  memoria.push({ rotulo: "Retenção do fornecedor (escada por data)", valor: retencaoFornecedor, tipo: "moeda" });
  if (naoRecuperaveis > 0) memoria.push({ rotulo: "Valores não recuperáveis", valor: naoRecuperaveis, tipo: "moeda" });
  if (remuneracaoServicos > 0) memoria.push({ rotulo: "Remuneração por serviços", valor: remuneracaoServicos, tipo: "moeda" });
  memoria.push({ rotulo: `Total retido (${moedaPrograma})`, valor: totalRetidoMoeda, tipo: "moeda" });
  memoria.push({ rotulo: `Câmbio aplicado (VET = PTAX ${ptax} · IOF ${Math.round(iof * 1000) / 10}% · spread ${Math.round(spread * 1000) / 10}%)`, valor: vet, tipo: "num" });
  memoria.push({ rotulo: "Total retido (BRL)", valor: totalRetidoBRL, tipo: "moeda_brl" });
  memoria.push({ rotulo: "Total pago pelo cliente (BRL)", valor: totalPagoBRL, tipo: "moeda_brl" });
  if (aindaDevidoBRL > 0) {
    memoria.push({ rotulo: "Saldo ainda devido pelo cliente (BRL)", valor: aindaDevidoBRL, tipo: "moeda_brl" });
  } else {
    memoria.push({ rotulo: "Reembolso ao cliente (BRL)", valor: reembolsoBRL, tipo: "moeda_brl" });
  }
  if (input.proximoDegrauEmISO) {
    memoria.push({ rotulo: `A retenção aumenta em ${input.proximoDegrauEmISO.slice(0, 10)}`, valor: 0, tipo: "info" });
  }

  return {
    moedaPrograma,
    retencaoExpTour,
    pisoProximidadeAplicado,
    retencaoFornecedor,
    naoRecuperaveis,
    remuneracaoServicos,
    totalRetidoMoeda,
    vet,
    totalRetidoBRL,
    totalPagoBRL,
    reembolsoBRL,
    aindaDevidoBRL,
    memoria,
  };
}
