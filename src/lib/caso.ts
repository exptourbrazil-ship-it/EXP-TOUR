// Helpers PUROS (sem rede/DB) do Caso 360 do admin. Ficam separados do loader
// server-only (admin-caso.ts) para poderem ser testados com o runner nativo do
// Node, sem mocks. Cuidam de: montar o filtro seguro de eventos do caso,
// derivar os sinais da jornada, agregar o saldo em aberto por moeda e estimar
// o equivalente em BRL. Ver docs/07-arquitetura-area-administrativa.md (3.2).

const RE_UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

// Aceita apenas UUID canonico. Usado antes de interpolar no PostgREST .or().
export function ehUuid(valor: unknown): valor is string {
  return typeof valor === "string" && RE_UUID.test(valor);
}

// Reduz um CPF ao que ele pode legitimamente ser no filtro: so digitos. Retorna
// null quando nao sobra um CPF plausivel (11 digitos). Evita injetar virgulas,
// pontos ou operadores no .or() do PostgREST.
export function cpfSeguro(cpf: unknown): string | null {
  if (typeof cpf !== "string") return null;
  const digitos = cpf.replace(/\D/g, "");
  return digitos.length === 11 ? digitos : null;
}

// Monta a expressao do PostgREST .or() para achar as entradas de admin_audit do
// caso: por alvo (id do titular OU cpf) e por detalhe->>titular_id/titularId.
// So inclui termos JA validados (titularId precisa ser UUID; cpf, 11 digitos),
// entao nao ha como injetar filtro. Lanca se o titularId nao for UUID — o
// chamador nunca deve montar o filtro com um id nao confiavel.
export function montarFiltroEventosCaso(titularId: string, cpf: string | null): string {
  if (!ehUuid(titularId)) {
    throw new Error("titularId invalido para o filtro de eventos.");
  }
  const termos = [
    `alvo.eq.${titularId}`,
    `detalhe->>titular_id.eq.${titularId}`,
    `detalhe->>titularId.eq.${titularId}`,
  ];
  const cpfLimpo = cpfSeguro(cpf);
  if (cpfLimpo) termos.push(`alvo.eq.${cpfLimpo}`);
  return termos.join(",");
}

// Diferenca em dias de calendario (UTC) entre a data de inicio e hoje. Positivo
// = faltam N dias; <= 0 = ja comecou. null quando nao ha data de inicio.
export function diasAteInicio(dataInicioISO: string | null | undefined, hojeISO: string): number | null {
  if (!dataInicioISO || dataInicioISO.length < 10 || !hojeISO || hojeISO.length < 10) return null;
  const [ai, mi, di] = dataInicioISO.slice(0, 10).split("-").map(Number);
  const [ah, mh, dh] = hojeISO.slice(0, 10).split("-").map(Number);
  const inicio = Date.UTC(ai, mi - 1, di);
  const hoje = Date.UTC(ah, mh - 1, dh);
  return Math.round((inicio - hoje) / (24 * 60 * 60 * 1000));
}

// Saldo em aberto (parcelas nao pagas) por moeda do programa. Recebe a moeda de
// cada contrato para saber em que moeda cada parcela conta. Arredonda centavos.
export function saldoPorMoedaAberto(
  parcelas: Array<{ contrato_id: string; status: string; valor_atual: number | string | null }>,
  moedaPorContrato: Map<string, string>
): Record<string, number> {
  const saldo: Record<string, number> = {};
  for (const p of parcelas) {
    if (p.status === "pago") continue;
    const moeda = (moedaPorContrato.get(p.contrato_id) || "?").toUpperCase();
    const valor = Number(p.valor_atual) || 0;
    saldo[moeda] = Math.round(((saldo[moeda] || 0) + valor) * 100) / 100;
  }
  return saldo;
}

// Estima o saldo total em BRL somando cada moeda pela cotacao do dia. Retorna
// null quando falta cotacao para ALGUMA moeda com saldo (estimativa parcial nao
// deve ser passada como total). {} de saldo -> 0.
export function estimarSaldoBRL(
  saldoPorMoeda: Record<string, number>,
  cotacoesPorMoeda: Record<string, number>
): number | null {
  let total = 0;
  for (const [moeda, valor] of Object.entries(saldoPorMoeda)) {
    if (valor === 0) continue;
    if (moeda === "BRL") {
      total += valor;
      continue;
    }
    const cotacao = cotacoesPorMoeda[moeda];
    if (!cotacao) return null;
    total += valor * cotacao;
  }
  return Math.round(total * 100) / 100;
}
