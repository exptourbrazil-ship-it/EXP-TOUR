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
