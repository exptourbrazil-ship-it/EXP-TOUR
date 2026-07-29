// Helpers PUROS (sem rede/DB) para as metricas financeiras do painel admin.
// Recebem linhas ja buscadas e uma data de referencia (string YYYY-MM-DD),
// para poderem ser testados sem mocks e sem depender do relogio.
//
// Decisao de modelagem (multi-moeda): a divida vive na MOEDA DO PROGRAMA de
// cada contrato (CAD, USD, ...), entao NAO somamos moedas diferentes num unico
// numero. Valores em aberto/atraso/vencendo sao agrupados por moeda. O unico
// numero em BRL e o "recebido", que vem do ledger `pagamentos` (valor_brl
// efetivamente pago), onde o cambio ja foi materializado.

export type StatusParcela = "pendente" | "pago" | "atrasado";

// Parcela enriquecida com a moeda do contrato (junta parcelas + contratos).
export type ParcelaMetrica = {
  status: StatusParcela | string;
  vencimento: string; // YYYY-MM-DD
  valor_atual: number | string; // valor efetivo na moeda do programa
  moeda: string; // moeda do programa (do contrato)
};

export type PagamentoMetrica = {
  valor_brl: number | string;
  pago_em: string; // timestamp ISO
};

// Total agrupado por moeda: { CAD: 12500, USD: 300 }.
export type ValorPorMoeda = Record<string, number>;

export type ResumoAberto = {
  count: number;
  porMoeda: ValorPorMoeda;
};

export type MetricasFinanceiras = {
  recebidoMesBRL: number;
  aReceber: ResumoAberto; // pendente + atrasado (tudo que nao foi pago)
  emAtraso: ResumoAberto; // nao pago e vencido
  vencendo7d: ResumoAberto; // nao pago e vencendo de hoje ate hoje+7
};

// Arredonda para centavos, evitando lixo de ponto flutuante.
function centavos(v: number): number {
  return Math.round(v * 100) / 100;
}

// Soma um valor ao acumulador por moeda (cria a chave se preciso).
function acumular(acc: ValorPorMoeda, moeda: string, valor: number): void {
  const chave = (moeda || "?").toUpperCase();
  acc[chave] = centavos((acc[chave] || 0) + valor);
}

// Soma dos dois primeiros niveis: retorna um novo ResumoAberto vazio.
function resumoVazio(): ResumoAberto {
  return { count: 0, porMoeda: {} };
}

// Soma `dias` a uma data YYYY-MM-DD, em UTC (aritmetica de calendario, sem
// surpresa de fuso/DST), devolvendo outra string YYYY-MM-DD.
export function adicionarDias(iso: string, dias: number): string {
  const [ano, mes, dia] = iso.split("-").map(Number);
  const base = Date.UTC(ano, mes - 1, dia);
  const d = new Date(base + dias * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

// `true` se a parcela ja foi paga (nao entra em aberto/atraso/vencendo).
function estaPaga(p: ParcelaMetrica): boolean {
  return p.status === "pago";
}

// Calcula as metricas financeiras a partir das linhas ja buscadas.
// `hojeISO` e a data de referencia (YYYY-MM-DD); o mes de "recebido" e
// derivado dela (YYYY-MM). Uma parcela e considerada ATRASADA quando nao foi
// paga e o vencimento e anterior a hoje — independentemente do status gravado,
// para nao depender de um job que vire 'pendente' em 'atrasado'.
export function calcularMetricas(
  parcelas: ParcelaMetrica[],
  pagamentos: PagamentoMetrica[],
  hojeISO: string
): MetricasFinanceiras {
  const mesRef = hojeISO.slice(0, 7); // YYYY-MM
  const limite7d = adicionarDias(hojeISO, 7);

  let recebidoMesBRL = 0;
  for (const pg of pagamentos) {
    if (typeof pg.pago_em === "string" && pg.pago_em.slice(0, 7) === mesRef) {
      recebidoMesBRL = centavos(recebidoMesBRL + (Number(pg.valor_brl) || 0));
    }
  }

  const aReceber = resumoVazio();
  const emAtraso = resumoVazio();
  const vencendo7d = resumoVazio();

  for (const p of parcelas) {
    if (estaPaga(p)) continue;
    const valor = Number(p.valor_atual) || 0;

    // Tudo que nao foi pago conta como "a receber".
    aReceber.count += 1;
    acumular(aReceber.porMoeda, p.moeda, valor);

    if (p.vencimento < hojeISO) {
      emAtraso.count += 1;
      acumular(emAtraso.porMoeda, p.moeda, valor);
    } else if (p.vencimento <= limite7d) {
      // De hoje (inclusive) ate hoje+7: vencendo em breve.
      vencendo7d.count += 1;
      acumular(vencendo7d.porMoeda, p.moeda, valor);
    }
  }

  return { recebidoMesBRL, aReceber, emAtraso, vencendo7d };
}
