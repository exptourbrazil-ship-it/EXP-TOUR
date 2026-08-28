// Motor PURO da previsao de repasse ao fornecedor (extrato financeiro, doc 05
// secao 2 / doc 06 secao 3.6). Sem rede/DB: dado o valor bruto do programa, o
// acordo de comissao (supplier_agreement) e a data de inicio + prazo, calcula
// comissao retida, liquido a remeter e o vencimento D-30. Testado em
// payout-calc.test.ts.
//
// A PREVISAO nao e estado gravado: e derivada ao vivo. O que vira "dinheiro"
// (supplier_payout) so nasce na execucao auditada pelo Admin (Fatia 2).

// Espelham os CHECKs de supplier_agreement.
export type ComissaoBasis = "tuition" | "tuition_plus_fees" | "total" | "none";
export type ComissaoType = "percent" | "fixed_per_sale" | "fixed_per_week";

export type AcordoComissao = {
  basis: ComissaoBasis;
  type: ComissaoType;
  value: number; // percentual (0-100) OU valor fixo, conforme o type
  currency?: string | null;
} | null;

export type EntradaPrevisao = {
  grossAmount: number | null; // bruto do programa (moeda de origem)
  currency: string | null;
  dataInicio: string | null; // ISO YYYY-MM-DD do inicio do programa
  prazoDias: number; // D-N (padrao 30)
  acordo: AcordoComissao;
  semanas?: number | null; // para comissao fixed_per_week
  hoje: string; // ISO YYYY-MM-DD (injetado para pureza)
};

export type Previsao = {
  grossAmount: number | null;
  commissionAmount: number | null; // null = a definir (sem acordo aplicavel)
  netAmount: number | null; // null = a definir
  currency: string | null;
  dueDate: string | null; // ISO (data_inicio - prazoDias)
  diasAteVencimento: number | null; // relativo a hoje (negativo = vencido)
  comissaoDefinida: boolean; // false quando falta acordo/parametro
};

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

// Parse estrito de YYYY-MM-DD -> epoch dias (UTC). Null se invalido.
function diasEpoch(iso: string | null | undefined): number | null {
  if (typeof iso !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const ms = Date.UTC(y, mo - 1, d);
  const dt = new Date(ms);
  // Rejeita datas "esticadas" (ex.: 2026-02-31 -> marco).
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return Math.floor(ms / 86_400_000);
}

function isoDeDias(dias: number): string {
  const dt = new Date(dias * 86_400_000);
  const y = dt.getUTCFullYear();
  const mo = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${mo}-${d}`;
}

// Comissao retida pela EXP Tour a partir do acordo. Retorna null quando nao ha
// como calcular com seguranca (sem acordo, parametro faltando, ou moeda do valor
// fixo diferente da moeda do bruto — nunca "adivinha" cambio aqui).
function calcularComissao(
  gross: number,
  currency: string | null,
  acordo: AcordoComissao,
  semanas: number | null | undefined
): number | null {
  if (!acordo) return null;
  if (acordo.basis === "none") return 0;
  const value = num(acordo.value);
  if (value === null || value < 0) return null;

  if (acordo.type === "percent") {
    const pct = Math.min(value, 100); // clamp defensivo (percentual)
    return round2((gross * pct) / 100);
  }

  // Valores fixos: so aplicaveis se a moeda do acordo casar com a do bruto
  // (ou o acordo nao especificar moeda — assume a do programa).
  const moedaAcordo = typeof acordo.currency === "string" ? acordo.currency.toUpperCase().trim() : "";
  const moedaBruto = typeof currency === "string" ? currency.toUpperCase().trim() : "";
  if (moedaAcordo && moedaBruto && moedaAcordo !== moedaBruto) return null;

  if (acordo.type === "fixed_per_sale") {
    return round2(value);
  }
  if (acordo.type === "fixed_per_week") {
    const w = num(semanas);
    if (w === null || w <= 0) return null; // sem numero de semanas nao da para calcular
    return round2(value * w);
  }
  return null;
}

// Calcula a previsao de repasse de um caso. Puro e defensivo: entrada suja
// (nulls, moeda faltando) nunca lanca — devolve o que der para calcular.
export function calcularPrevisao(entrada: EntradaPrevisao): Previsao {
  const gross = num(entrada.grossAmount);
  const currency = typeof entrada.currency === "string" && entrada.currency.trim() ? entrada.currency.toUpperCase().trim() : null;
  const prazo = num(entrada.prazoDias);
  const prazoDias = prazo !== null && prazo >= 0 ? Math.floor(prazo) : 30;

  // Vencimento D-N = data_inicio - prazoDias.
  const inicioDias = diasEpoch(entrada.dataInicio);
  const hojeDias = diasEpoch(entrada.hoje);
  const dueDate = inicioDias !== null ? isoDeDias(inicioDias - prazoDias) : null;
  const diasAteVencimento =
    inicioDias !== null && hojeDias !== null ? inicioDias - prazoDias - hojeDias : null;

  // Comissao/liquido dependem do bruto conhecido.
  let commissionAmount: number | null = null;
  let netAmount: number | null = null;
  let comissaoDefinida = false;
  if (gross !== null) {
    const c = calcularComissao(gross, currency, entrada.acordo, entrada.semanas);
    if (c !== null) {
      commissionAmount = c;
      netAmount = round2(Math.max(0, gross - c)); // liquido nunca negativo
      comissaoDefinida = true;
    }
  }

  return {
    grossAmount: gross,
    commissionAmount,
    netAmount,
    currency,
    dueDate,
    diasAteVencimento,
    comissaoDefinida,
  };
}
