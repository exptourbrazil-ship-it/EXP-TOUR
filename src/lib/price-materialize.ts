// Materializacao do rascunho de price list em CATALOGO (Fase C, fatia 2).
// A parte PURA monta o "plano" (as linhas que serao inseridas, sem ids) a partir
// do rascunho aprovado; a inser cao/FKs/transacao ficam no servico. Testado.
import type { PriceListExtraido, ProgramaExtraido, AcomodacaoExtraida, TaxaExtraida } from "@/lib/price-list-extract";

export type PlanoProduto = {
  kind: "program" | "accommodation";
  name: string;
  unit: string;
  // detalhe especifico (program_detail / accommodation_detail), sem product_id.
  detail: Record<string, unknown>;
  template: {
    name: string;
    price_basis: "duration";
    duration_type: "flexible";
    unit: string;
    currency: string;
    charge_in_tiers: boolean;
  };
  tiers: { min_quantity: number; unit_price: number; sort: number }[];
};

export type PlanoTaxa = {
  name: string;
  fee_type: string;
  charge_basis: string;
  amount: number;
  currency: string;
  is_mandatory: boolean;
};

export type PlanoMaterializacao = { produtos: PlanoProduto[]; taxas: PlanoTaxa[] };

function planoDeProduto(
  kind: "program" | "accommodation",
  item: ProgramaExtraido | AcomodacaoExtraida,
  currency: string
): PlanoProduto | null {
  // Sem faixa de preco nao ha o que precificar -> nao materializa este produto.
  if (item.tiers.length === 0) return null;
  const tiers = [...item.tiers]
    .sort((a, b) => a.minQuantity - b.minQuantity)
    .map((t, i) => ({ min_quantity: t.minQuantity, unit_price: t.unitPrice, sort: i }));

  const detail: Record<string, unknown> =
    kind === "program"
      ? { education_type: (item as ProgramaExtraido).educationType }
      : { accommodation_type: (item as AcomodacaoExtraida).type };

  return {
    kind,
    name: item.name,
    unit: item.unit,
    detail,
    template: {
      name: item.name,
      price_basis: "duration",
      duration_type: "flexible",
      unit: item.unit,
      currency,
      // Preco por duracao "flat" na faixa (a faixa e escolhida pela duracao total);
      // graduado (charge_in_tiers) nao e o padrao de price list de escola.
      charge_in_tiers: false,
    },
    tiers,
  };
}

function planoDeTaxa(t: TaxaExtraida, currency: string): PlanoTaxa {
  return {
    name: t.name,
    fee_type: t.feeType || "custom",
    charge_basis: t.basis || "once_per_quote",
    amount: t.amount,
    currency,
    is_mandatory: true,
  };
}

// Monta o plano de materializacao a partir do rascunho aprovado + a moeda.
// A moeda e obrigatoria (price_template.currency e NOT NULL); o chamador valida
// antes. Produtos sem faixa sao ignorados; taxas ja vem com amount > 0.
export function planoDeMaterializacao(extracted: PriceListExtraido, currency: string): PlanoMaterializacao {
  const produtos: PlanoProduto[] = [];
  for (const p of extracted.programs) {
    const plano = planoDeProduto("program", p, currency);
    if (plano) produtos.push(plano);
  }
  for (const a of extracted.accommodations) {
    const plano = planoDeProduto("accommodation", a, currency);
    if (plano) produtos.push(plano);
  }
  const taxas = extracted.fees.map((f) => planoDeTaxa(f, currency));
  return { produtos, taxas };
}

// Quantas linhas o plano vai gerar (para o resumo da aprovacao).
export function resumoDoPlano(plano: PlanoMaterializacao): { produtos: number; taxas: number; faixas: number } {
  return {
    produtos: plano.produtos.length,
    taxas: plano.taxas.length,
    faixas: plano.produtos.reduce((s, p) => s + p.tiers.length, 0),
  };
}
