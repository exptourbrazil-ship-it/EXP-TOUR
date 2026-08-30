// Motor PURO do recibo itemizado na Area do Cliente (Clausula 6.5.2). Recebe a
// decomposicao ja calculada (itemizarRecibo, em cambio.ts) como primitivos e
// monta as linhas rotuladas para render/impressao. Espelha o recibo por e-mail,
// que ja existe. Itens (f) do contrato: PTAX+data, Taxa de Intermediacao (%/R$),
// IOF (%/R$), total pago, valor amortizado e SALDO remanescente na moeda.
//
// SEM imports (nem "@/..." nem extensao): roda no runner nativo do Node.
// Deterministico (formatadores manuais, sem Intl) -> testavel sem ICU.

export type ReciboViewInput = {
  descricao: string; // ex.: "Parcela 2/4" ou "Entrada"
  dataFormatada: string; // data/hora da liquidacao, ja formatada
  moeda: string; // moeda do programa (ex.: CAD)
  semCambio: boolean; // contrato em BRL (sem VET) -> recibo simplificado
  // Decomposicao (itemizarRecibo). Ignorada quando semCambio.
  ptax: number;
  subtotal: number; // valor convertido (R$)
  taxaPercentual: number; // ex.: 0.05
  taxaIntermediacao: number; // R$
  iofPercentual: number; // ex.: 0.035
  iof: number; // R$
  totalBRL: number; // total pago (R$)
  amortizacaoMoeda: number; // amortizado na moeda
  saldoRestanteMoeda: number | null; // saldo remanescente na moeda (null = indisponivel)
  legado: boolean; // spread veio do fallback legado (cobranca anterior a 5%)
};

export type ReciboView = {
  titulo: string;
  descricao: string;
  dataFormatada: string;
  linhas: Array<{ rotulo: string; valor: string; destaque?: boolean }>;
  nota: string;
  avisoLegado: string | null;
};

// ---- Formatadores deterministicos (sem Intl) --------------------------------
function agrupaMilhar(inteiro: string): string {
  let out = "";
  for (let i = 0; i < inteiro.length; i++) {
    if (i > 0 && (inteiro.length - i) % 3 === 0) out += ".";
    out += inteiro[i];
  }
  return out;
}
function fixo(valor: number, casas: number): string {
  const neg = valor < 0;
  const fator = Math.pow(10, casas);
  const total = Math.round(Math.abs(valor) * fator);
  const div = Math.pow(10, casas);
  const inteiro = Math.floor(total / div).toString();
  const dec = (total % div).toString().padStart(casas, "0");
  return `${neg ? "-" : ""}${agrupaMilhar(inteiro)},${dec}`;
}
export function brl(n: number): string {
  return "R$ " + fixo(n, 2);
}
export function moe(n: number, moeda: string): string {
  return `${(moeda || "").toUpperCase()} ${fixo(n, 2)}`;
}
export function pct(fracao: number): string {
  const v = Math.round(fracao * 100 * 1000) / 1000;
  return String(v).replace(".", ",") + "%";
}
// PTAX com 4 a 6 casas (apara zeros a direita, minimo 4).
export function ptaxFmt(n: number): string {
  let s6 = fixo(n, 6); // "x,xxxxxx"
  const [int, dec] = s6.split(",");
  let d = dec;
  while (d.length > 4 && d.endsWith("0")) d = d.slice(0, -1);
  return "R$ " + int + "," + d;
}

const NOTA_SEM_TARIFA =
  "Nenhuma tarifa bancária ou despesa de remessa é cobrada separadamente — estão compreendidas na Taxa de Intermediação e Câmbio.";

export function montarReciboView(input: ReciboViewInput): ReciboView {
  const linhas: ReciboView["linhas"] = [];

  if (!input.semCambio) {
    linhas.push({ rotulo: "PTAX de venda (BCB) aplicada", valor: ptaxFmt(input.ptax) });
    linhas.push({ rotulo: "Valor convertido", valor: brl(input.subtotal) });
    linhas.push({ rotulo: `Taxa de Intermediação e Câmbio (${pct(input.taxaPercentual)})`, valor: brl(input.taxaIntermediacao) });
    linhas.push({ rotulo: `IOF-câmbio (${pct(input.iofPercentual)})`, valor: brl(input.iof) });
  }
  linhas.push({ rotulo: "Total pago", valor: brl(input.totalBRL), destaque: true });
  linhas.push({ rotulo: "Valor amortizado", valor: moe(input.amortizacaoMoeda, input.moeda) });
  if (input.saldoRestanteMoeda != null) {
    linhas.push({ rotulo: "Saldo devedor remanescente", valor: moe(input.saldoRestanteMoeda, input.moeda) });
  }

  return {
    titulo: "Recibo de pagamento",
    descricao: input.descricao,
    dataFormatada: input.dataFormatada,
    linhas,
    nota: input.semCambio
      ? "Pagamento em reais, sem conversão cambial."
      : NOTA_SEM_TARIFA,
    avisoLegado: input.legado
      ? "Percentuais congelados na geração desta cobrança (anteriores à vigência da taxa atual); o recibo permanece como emitido."
      : null,
  };
}
