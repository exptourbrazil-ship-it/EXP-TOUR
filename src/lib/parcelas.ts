// Helpers puros de parcelas (sem rede/DB), para poderem ser testados sem mocks.

// Tolerancia padrao (em unidades da moeda do contrato) na comparacao entre a
// soma das parcelas e o total do contrato. Absorve arredondamento de centavos
// sem permitir divergencia real.
export const TOLERANCIA_SOMA_PARCELAS = 0.01;

// Soma os valores das parcelas, arredondando o resultado para centavos.
export function somaValoresParcelas(valores: number[]): number {
  const soma = valores.reduce((acc, v) => acc + (Number(v) || 0), 0);
  return Math.round(soma * 100) / 100;
}

// Data-limite de quitacao do Saldo Devedor: 30 dias antes do inicio do
// programa (Clausula 7.4 do contrato, "regra dos 30 dias"). Recebe e retorna
// YYYY-MM-DD; null se nao houver data de inicio. Aritmetica em UTC (calendario).
export const DIAS_QUITACAO_ANTES = 30;
export function dataLimiteQuitacao(dataInicioISO: string | null | undefined): string | null {
  if (!dataInicioISO || dataInicioISO.length < 10) return null;
  const [ano, mes, dia] = dataInicioISO.slice(0, 10).split("-").map(Number);
  const base = Date.UTC(ano, mes - 1, dia);
  const d = new Date(base - DIAS_QUITACAO_ANTES * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// PLANO DE PARCELAMENTO
// ---------------------------------------------------------------------------
// O numero de parcelas NAO e fixo nem vem do Zoho: e derivado da janela entre
// a data da compra e o inicio do programa. Regras:
//
//   - entrada           -> vence na data da compra
//   - primeira parcela  -> no minimo 30 dias apos a compra (carencia)
//   - parcelas mensais  -> todo dia 15
//   - ultima parcela    -> no maximo 30 dias antes do inicio (Clausula 7.4)
//
// Logo: quantidade = quantos dias 15 cabem entre (compra + 30d) e (inicio - 30d).
// Janela curta gera menos parcelas; janela insuficiente gera zero (so entrada).

export const DIA_VENCIMENTO_PARCELA = 15;
export const DIAS_ATE_PRIMEIRA_PARCELA = 30;

// Converte YYYY-MM-DD em timestamp UTC de meia-noite. Toda a aritmetica de
// datas aqui e feita em UTC para o resultado nao depender do fuso do servidor.
function utcDeISO(iso: string): number {
  const [ano, mes, dia] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(ano, mes - 1, dia);
}

// Vencimentos das parcelas mensais (sem a entrada), em ordem crescente.
// Retorna [] quando nao ha data de inicio ou quando a janela nao comporta
// nenhuma parcela -- nesse caso o contrato fica so com a entrada.
export function calcularVencimentosParcelas(
  dataCompraISO: string,
  dataInicioISO: string | null | undefined
): string[] {
  const limiteISO = dataLimiteQuitacao(dataInicioISO);
  if (!limiteISO || !dataCompraISO || dataCompraISO.length < 10) return [];

  const limite = utcDeISO(limiteISO);
  const compra = utcDeISO(dataCompraISO);
  const minimo = compra + DIAS_ATE_PRIMEIRA_PARCELA * 24 * 60 * 60 * 1000;

  // Primeiro dia 15 que respeita a carencia de 30 dias.
  const ref = new Date(minimo);
  const ano = ref.getUTCFullYear();
  let mes = ref.getUTCMonth();
  let vencimento = Date.UTC(ano, mes, DIA_VENCIMENTO_PARCELA);
  if (vencimento < minimo) {
    mes += 1;
    vencimento = Date.UTC(ano, mes, DIA_VENCIMENTO_PARCELA);
  }

  const vencimentos: string[] = [];
  while (vencimento <= limite) {
    vencimentos.push(new Date(vencimento).toISOString().slice(0, 10));
    mes += 1;
    // Date.UTC normaliza mes >= 12 virando o ano, entao nao ha caso especial.
    vencimento = Date.UTC(ano, mes, DIA_VENCIMENTO_PARCELA);
  }

  return vencimentos;
}

// Divide um valor em N parcelas iguais em centavos, jogando a sobra do
// arredondamento na ULTIMA parcela. Garante que a soma bata exatamente com o
// valor recebido (invariante verificada por somaParcelasConfere).
export function dividirValorParcelas(valor: number, quantidade: number): number[] {
  if (quantidade <= 0) return [];

  const totalCentavos = Math.round(valor * 100);
  const baseCentavos = Math.floor(totalCentavos / quantidade);

  const centavos = new Array(quantidade).fill(baseCentavos);
  centavos[quantidade - 1] = totalCentavos - baseCentavos * (quantidade - 1);

  return centavos.map((c) => c / 100);
}

// Saldo Devedor na moeda do programa: soma do valor efetivo das parcelas NAO
// pagas (Clausula 6.3). E a obrigacao remanescente, sobre a qual se aplica a
// cotacao do dia para o "valor de quitacao hoje".
export function saldoDevedorMoeda(parcelas: Array<{ valor_atual: number | string; status: string }>): number {
  const soma = parcelas
    .filter((p) => p.status !== "pago")
    .reduce((acc, p) => acc + (Number(p.valor_atual) || 0), 0);
  return Math.round(soma * 100) / 100;
}

// Valor efetivo da parcela na moeda do programa, ja com os ajustes do cliente.
// `valor_atual` guarda SEMPRE o valor na moeda do programa (o BRL cobrado no
// Pix vive na coluna `valor_cobrado_brl`, nao aqui). `valor_original` e o plano
// original imutavel, usado apenas para "Restaurar plano original".
export function valorProgramaAtual(p: { valor_atual: number | string }): number {
  return Number(p.valor_atual);
}

// Verifica se a soma dos valores das parcelas confere com o total do contrato,
// dentro da tolerancia. Comparacao feita na moeda do contrato (sem conversao).
export function somaParcelasConfere(
  valores: number[],
  valorTotal: number,
  tolerancia: number = TOLERANCIA_SOMA_PARCELAS
): boolean {
  // Comparacao feita em centavos inteiros para evitar erros de ponto
  // flutuante na fronteira da tolerancia (ex.: |99,99 - 100,00| que em float
  // resulta em 0,01000...9 e passaria falsamente do limite de 0,01).
  const soma = somaValoresParcelas(valores);
  const diffCents = Math.round(Math.abs(soma - valorTotal) * 100);
  const tolCents = Math.round(tolerancia * 100);
  return diffCents <= tolCents;
}

// ---------------------------------------------------------------------------
// MOTOR DE ALTERACAO — previa do plano no adiamento de inicio (E2, doc 01 §4)
// ---------------------------------------------------------------------------
// Reagenda o SALDO em aberto na nova janela ate a nova data-limite de quitacao
// (D-30 do novo inicio), reusando as mesmas regras do plano original (carencia
// de 30 dias, dia 15, quitacao D-30). NESTE passo e so uma PREVIA (rascunho
// revisado por humano): NAO reescreve parcelas nem gera aditivo. Parcelas pagas
// nao entram (so o saldo em aberto). Vive aqui, junto dos helpers que reusa,
// para permanecer um modulo-folha testavel (node --test nao resolve `@/`).

export type ParcelaProposta = { numero: number; vencimento: string; valor: number };

export type PlanoDeferral = {
  novaDataQuitacao: string | null; // D-30 do novo inicio
  planoProposto: ParcelaProposta[]; // reagendamento do saldo em aberto
  cabe: boolean; // false se ha saldo mas nenhuma data valida
};

export function calcularPlanoDeferral(args: {
  saldoDevedor: number;
  dataReferencia: string; // base da carencia (hoje); 1a nova parcela vence >=30d
  novaDataInicio: string;
}): PlanoDeferral {
  const novaDataQuitacao = dataLimiteQuitacao(args.novaDataInicio);
  const saldo = Math.max(0, Math.round((Number(args.saldoDevedor) || 0) * 100) / 100);

  if (saldo <= 0) {
    return { novaDataQuitacao, planoProposto: [], cabe: true };
  }

  const vencimentos = calcularVencimentosParcelas(args.dataReferencia, args.novaDataInicio);

  // Sem nenhum dia-15 disponivel na janela: propoe parcela unica na data-limite
  // de quitacao (a vista ate la), se houver data valida.
  if (vencimentos.length === 0) {
    if (!novaDataQuitacao) return { novaDataQuitacao, planoProposto: [], cabe: false };
    return {
      novaDataQuitacao,
      planoProposto: [{ numero: 1, vencimento: novaDataQuitacao, valor: saldo }],
      cabe: true,
    };
  }

  const valores = dividirValorParcelas(saldo, vencimentos.length);
  const planoProposto = vencimentos.map((vencimento, i) => ({
    numero: i + 1,
    vencimento,
    valor: valores[i],
  }));

  return { novaDataQuitacao, planoProposto, cabe: true };
}

// ---------------------------------------------------------------------------
// MOTOR DE ALTERACAO — previa do delta e do plano na ALTERACAO DE ESCOPO
// (E3, doc 01 §4: extensao / upgrade / troca / servicos adicionais)
// ---------------------------------------------------------------------------
// Diferente do E2 (so move datas), o E3 muda o VALOR do programa -> delta
// financeiro na moeda. Esta funcao calcula o delta (novo - atual), o novo saldo
// a reagendar (novo total - ja pago) e reusa `calcularPlanoDeferral` para o
// plano recalculado dentro da janela atual (a data de inicio NAO muda nesta
// fatia). SENTIDO:
//   - "aditivo": delta > 0  -> cobranca complementar (aditivo de compra; a
//     execucao via checkout/aceite e um marco a parte, deferido).
//   - "credito": delta < 0  -> reducao. Se o ja pago superar o novo total, ha
//     credito a devolver ao cliente (encaminha ao motor de acerto/refund).
//   - "neutro": delta == 0.
// NESTE passo e so uma PREVIA (rascunho revisado): NAO reescreve parcelas, NAO
// cobra e NAO devolve. Parcelas pagas nao sao tocadas.

export type SentidoAlteracao = "aditivo" | "credito" | "neutro";

export type PlanoEscopo = {
  valorProgramaAtual: number;
  valorProgramaNovo: number;
  delta: number; // novo - atual (na moeda do programa)
  jaPago: number;
  novoSaldo: number; // max(0, novo total - ja pago) -> o que sera reagendado
  creditoCliente: number; // max(0, ja pago - novo total) -> refund a apurar (acerto)
  sentido: SentidoAlteracao;
  novaDataQuitacao: string | null;
  planoProposto: ParcelaProposta[];
  cabe: boolean;
};

function centavos(n: unknown): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function calcularAlteracaoEscopo(args: {
  valorProgramaAtual: number;
  valorProgramaNovo: number;
  jaPago: number;
  dataReferencia: string; // base da carencia (hoje)
  dataInicio: string; // inicio ATUAL do programa (E3 nao muda datas nesta fatia)
}): PlanoEscopo {
  const valorProgramaAtual = centavos(args.valorProgramaAtual);
  const valorProgramaNovo = centavos(args.valorProgramaNovo);
  const jaPago = Math.max(0, centavos(args.jaPago));
  const delta = centavos(valorProgramaNovo - valorProgramaAtual);
  const saldoLiquido = centavos(valorProgramaNovo - jaPago);
  const novoSaldo = Math.max(0, saldoLiquido);
  const creditoCliente = Math.max(0, centavos(-saldoLiquido));
  const sentido: SentidoAlteracao = delta > 0 ? "aditivo" : delta < 0 ? "credito" : "neutro";

  const plano = calcularPlanoDeferral({
    saldoDevedor: novoSaldo,
    dataReferencia: args.dataReferencia,
    novaDataInicio: args.dataInicio,
  });

  return {
    valorProgramaAtual,
    valorProgramaNovo,
    delta,
    jaPago,
    novoSaldo,
    creditoCliente,
    sentido,
    novaDataQuitacao: plano.novaDataQuitacao,
    planoProposto: plano.planoProposto,
    cabe: plano.cabe,
  };
}

// ---------------------------------------------------------------------------
// EXECUCAO EM CASCATA — validacao do plano antes de aplicar (E2/E3)
// ---------------------------------------------------------------------------
// Antes de reescrever as parcelas, o rascunho revisado precisa continuar
// coerente: a soma do plano bate com o saldo esperado e nenhum vencimento caiu
// no passado (rascunho velho). Guarda pura (sem DB) para ser testavel; a
// atomicidade da escrita fica na funcao SQL `aplicar_alteracao`.
export type ValidacaoPlano = { ok: boolean; motivo?: string };

export function validarPlanoAplicavel(args: {
  plano: ParcelaProposta[];
  saldoEsperado: number;
  hojeISO: string;
}): ValidacaoPlano {
  const plano = Array.isArray(args.plano) ? args.plano : [];
  const saldo = centavos(args.saldoEsperado);
  const soma = somaValoresParcelas(plano.map((p) => Number(p.valor) || 0));
  if (Math.round(Math.abs(soma - saldo) * 100) > 1) {
    return { ok: false, motivo: "soma_nao_bate" };
  }
  // Saldo zero: nada a reagendar -> plano vazio e valido (ex.: quitado apos downgrade).
  if (saldo <= 0) {
    return plano.length === 0 ? { ok: true } : { ok: false, motivo: "soma_nao_bate" };
  }
  if (plano.length === 0) return { ok: false, motivo: "plano_vazio" };
  for (const p of plano) {
    if (!p.vencimento || p.vencimento < args.hojeISO) {
      return { ok: false, motivo: "vencimento_no_passado" };
    }
  }
  return { ok: true };
}
