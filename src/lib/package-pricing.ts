// Precificacao de PACOTE com `pricing_mode = 'sum_of_items'` (funcoes PURAS).
//
// REGRAS (CLAUDE.md / guardiao do motor):
// - Sem I/O, sem next, sem Supabase: recebe objetos simples e devolve objetos
//   simples. Quem CARREGA os insumos do banco e `catalog-service.ts`.
// - NAO reimplementa calculo: cada item e precificado pelo `priceProduct` do
//   motor (faixas por duracao, vigencia por data de inicio, ajuste sazonal,
//   promocoes, taxas). Aqui so se (1) decide quais taxas cada item carrega, para
//   nao cobrar em dobro o que e "uma vez por cotacao", e (2) soma o resultado.
// - Dinheiro: arredondamento por linha (round2) e total = soma das linhas ja
//   arredondadas (sumMoney), nunca o arredondamento da soma.
// - Falha fechada: item sem preco, moedas diferentes ou quantidade incoerente
//   recusam o pacote INTEIRO, com mensagem em portugues dizendo qual item.
//
// ESCOPO v1: so itens obrigatorios (`is_optional=false`); itens opcionais ficam
// de fora (ver docs/decisions.md, ADR "Pacote sum_of_items").
import {
  priceProduct,
  sumMoney,
  averageUnitPrice,
  round2,
  aggregateRegistrationFee,
  isPromotionApplicable,
  type DiscountLine,
  type Fee,
  type FeeLine,
  type PriceRequest,
  type PricedItem,
  type Promotion,
  type RegistrationFeeRule,
  type SeasonalLine,
} from "./pricing.ts";

/** Recusa de negocio do pacote: mensagem em portugues, sem PII, segura para a tela. */
export class ErroPacote extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroPacote";
  }
}

/** Tipos de taxa que a taxa propria do pacote substitui nos itens (lista explicita). */
const TIPOS_SUBSTITUIVEIS = new Set(["registration", "material"]);

/** Item do pacote ja carregado: o `request` vem montado com a quantidade DO ITEM. */
export type ItemPacoteEntrada = {
  itemProductId: string;
  name: string;
  /** `package_item.quantity`: multiplicador sobre a quantidade do pacote (mesma unidade). */
  quantityFactor: number;
  /** Entrada do motor para o item, com `quantity = quantidade do pacote x quantityFactor`. */
  request: PriceRequest;
  /** Avisos do carregamento (ex.: ajuste sazonal em moeda diferente). */
  extraWarnings?: string[];
  /** Taxas opcionais que o consultor escolheu neste item (fee.id): nunca suprimidas. */
  chosenFeeIds?: string[];
};

export type PacoteEntrada = {
  packageName: string;
  quantity: number;
  startDate: string;
  unit: string;
  /** `campus_settings.multi_course_fee_rule` do campus do pacote. */
  multiCourseRule: RegistrationFeeRule;
  items: ItemPacoteEntrada[];
  /** Taxas vinculadas ao proprio produto pacote; entram no PRIMEIRO item. */
  packageFees?: Fee[];
  /** Limites do proprio pacote, para os mesmos avisos de duracao/disponibilidade. */
  packageProduct?: {
    minDuration?: number;
    maxDuration?: number;
    availableFrom?: string;
    availableUntil?: string;
  };
};

/** Resumo auditavel de cada item dentro do `breakdown` do pacote. */
export type ItemPacoteResultado = {
  productId: string;
  name: string;
  quantity: number;
  quantityFactor: number;
  billableQuantity: number;
  deliveredQuantity: number;
  endDate: string;
  grossAmount: number;
  averageUnitPrice: number;
  netAmount: number;
  /** `breakdown` completo do motor para este item. */
  breakdown: unknown;
};

/** Chave de identidade de uma taxa: o id do catalogo, ou uma chave composta sem id. */
function chaveTaxa(f: Fee): string {
  return f.id ?? `${f.feeType}|${f.name}|${f.amount}|${f.currency}`;
}

/**
 * Decide quais taxas cada item carrega. MESMA regra do motor para multi-curso
 * (`applyFees` + `campus_settings.multi_course_fee_rule`), aplicada ENTRE os
 * itens do pacote:
 *
 * 1. Taxa `once_per_quote` (ex.: matricula) com o mesmo id/chave aparece uma
 *    unica vez no pacote — fica no primeiro item que a traz.
 * 2. Entre matriculas (`feeType='registration'`, de QUALQUER `charge_basis`)
 *    vale a regra do campus: charge_highest/charge_lowest mantem so a
 *    maior/menor; charge_all mantem todas.
 * 3. Demais bases (`once_per_item`, `per_unit`, `per_person`) ficam em cada item:
 *    cada curso do pacote e um item e tem a propria quantidade.
 *
 * Decide ANTES de precificar, para que promocoes (ex.: isencao de matricula)
 * incidam so sobre as taxas que realmente sobraram. Nao muta a entrada.
 */
export function deduplicarTaxasEntreItens(
  taxasPorItem: Fee[][],
  regra: RegistrationFeeRule,
): Fee[][] {
  const vistas = new Set<string>();
  const unicas: Fee[][] = taxasPorItem.map((lista) => {
    const mantidas: Fee[] = [];
    for (const f of lista) {
      if (f.chargeBasis === "once_per_quote") {
        const k = chaveTaxa(f);
        if (vistas.has(k)) continue;
        vistas.add(k);
      }
      mantidas.push(f);
    }
    return mantidas;
  });

  // Matriculas distintas: regra do campus. Empate escolhe a primeira (ordem dos itens).
  const candidatas: { i: number; f: Fee }[] = [];
  unicas.forEach((lista, i) => {
    for (const f of lista) {
      if (f.feeType === "registration") candidatas.push({ i, f });
    }
  });
  if (candidatas.length > 1 && regra !== "charge_all") {
    // Reaproveita a agregacao do motor para achar o valor que prevalece.
    const alvo = aggregateRegistrationFee(candidatas.map((c) => c.f.amount), regra);
    const vencedora = candidatas.find((c) => round2(c.f.amount) === alvo) ?? candidatas[0];
    return unicas.map((lista, i) =>
      lista.filter(
        (f) =>
          f.feeType !== "registration" || (i === vencedora.i && f === vencedora.f),
      ),
    );
  }
  return unicas;
}

/** Sufixo "— item" para linhas que vem de UM item especifico (rastro legivel). */
function comItem(nome: string, item: string): string {
  return `${nome} — ${item}`;
}

/** Prefixa o aviso com o item, preservando o inicio "Warning bloqueante". */
function avisoDoItem(item: string, aviso: string): string {
  const BLOQ = "Warning bloqueante:";
  return aviso.startsWith(BLOQ)
    ? `${BLOQ} (${item}) ${aviso.slice(BLOQ.length).trim()}`
    : `(${item}) ${aviso}`;
}

/**
 * Precifica o pacote como SOMA DOS ITENS. Devolve um `PricedItem` com a mesma
 * forma de um item simples (para gravar em `quote_item`, `quote_item_fee` e
 * `quote_discount` sem mudar nenhum consumidor) e o rastro por item em
 * `breakdown.items`.
 */
export function precificarPacoteSomaDeItens(input: PacoteEntrada): PricedItem & {
  items: ItemPacoteResultado[];
} {
  const { items } = input;
  if (items.length === 0) {
    throw new ErroPacote(`O pacote "${input.packageName}" nao tem itens obrigatorios para precificar.`);
  }
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    throw new ErroPacote(`Quantidade invalida para o pacote "${input.packageName}".`);
  }

  // Coerencia dos requests montados pelo chamador (falha fechada).
  const moedas = new Set(items.map((i) => i.request.product.currency));
  if (moedas.size > 1) {
    throw new ErroPacote(
      `O pacote "${input.packageName}" tem itens em moedas diferentes (${[...moedas].join(", ")}): nao e possivel somar.`,
    );
  }
  for (const it of items) {
    const esperado = round2(input.quantity * it.quantityFactor);
    // Semanas FECHADAS: package_item.quantity fracionario geraria semana quebrada.
    if (input.unit === "week" && !Number.isInteger(esperado)) {
      throw new ErroPacote(
        `Pacote "${input.packageName}": o item "${it.name}" resultaria em ${esperado} semanas; so semanas inteiras sao aceitas.`,
      );
    }
    if (
      !Number.isFinite(it.quantityFactor) ||
      it.quantityFactor <= 0 ||
      round2(it.request.quantity) !== esperado ||
      it.request.unit !== input.unit ||
      it.request.startDate !== input.startDate
    ) {
      throw new ErroPacote(
        `Pacote "${input.packageName}": a quantidade/unidade/data do item "${it.name}" nao confere com a do pacote.`,
      );
    }
  }

  // Taxas PROPRIAS do pacote (applies_to_kinds 'package' ou fee_product do
  // pacote): dedupe por fee.id em QUALQUER base — uma taxa valida para 'program'
  // e 'package' ao mesmo tempo nao pode entrar duas vezes. Elas SUBSTITUEM, nos
  // itens, as taxas do mesmo fee_type (qualquer base): o pacote cobra matricula e
  // material uma vez, nao por curso. Fee_types sem taxa propria seguem a regra
  // dos itens (ver deduplicarTaxasEntreItens).
  const vistasPacote = new Set<string>();
  const taxasDoPacote = (input.packageFees ?? []).filter((f) => {
    const k = chaveTaxa(f);
    if (vistasPacote.has(k)) return false;
    vistasPacote.add(k);
    return true;
  });
  // Moeda: toda taxa (do pacote ou de item) precisa estar na moeda dos produtos.
  const moedaPacote = items[0].request.product.currency;
  for (const f of [...taxasDoPacote, ...items.flatMap((it) => it.request.fees)]) {
    if (f.currency !== moedaPacote) {
      throw new ErroPacote(
        `Pacote "${input.packageName}": a taxa "${f.name}" esta em ${f.currency}, diferente da moeda dos produtos (${moedaPacote}).`,
      );
    }
  }
  // So taxa com valor > 0 e de tipo substituivel (matricula/material) suprime.
  const tiposDoPacote = new Set(
    taxasDoPacote.filter((f) => f.amount > 0 && TIPOS_SUBSTITUIVEIS.has(f.feeType)).map((f) => f.feeType),
  );
  const suprimidas: Fee[] = [];
  const taxasBrutas = items.map((it, i) => [
    ...(i === 0 ? taxasDoPacote : []),
    ...it.request.fees.filter((f) => {
      if (vistasPacote.has(chaveTaxa(f))) return false; // mesma taxa do pacote: dedupe por id
      const escolhida = f.id != null && (it.chosenFeeIds ?? []).includes(f.id);
      if (tiposDoPacote.has(f.feeType) && !escolhida) {
        suprimidas.push(f);
        return false;
      }
      return true;
    }),
  ]);
  const taxas = deduplicarTaxasEntreItens(taxasBrutas, input.multiCourseRule);

  // Promocoes que NAO podem multiplicar pelo numero de itens: valor fixo, teto de
  // desconto e percentual nao empilhavel valem UMA vez no pacote, no primeiro
  // item a que se aplicam (erra para MENOS desconto, lado seguro). Percentuais
  // empilhaveis seguem item a item.
  const unicaVez = (p: Promotion) =>
    p.promoType === "fixed_off" || p.maxDiscountAmount != null || (p.promoType === "percent_off" && !p.isStackable);
  const consumidas = new Set<string>();
  const chavePromo = (p: Promotion) => p.id ?? `${p.promoType}|${p.name}|${p.value}`;
  const promocoesPorItem = items.map((it) => {
    return it.request.promotions.filter((p) => {
      if (!unicaVez(p)) return true;
      const k = chavePromo(p);
      if (consumidas.has(k)) return false;
      if (isPromotionApplicable(p, it.request.context)) consumidas.add(k);
      return true;
    });
  });

  const warnings: string[] = [];
  if (suprimidas.length > 0) {
    warnings.push(
      `Taxas dos itens suprimidas porque o pacote tem taxa propria do mesmo tipo: ${suprimidas
        .map((f) => `${f.name} (${f.amount} ${f.currency})`)
        .join("; ")}.`,
    );
  }
  const p = input.packageProduct;
  if (p?.availableFrom != null && input.startDate < p.availableFrom) {
    warnings.push(`(Pacote) Data de inicio ${input.startDate} anterior ao inicio da disponibilidade (${p.availableFrom}).`);
  }
  if (p?.availableUntil != null && input.startDate > p.availableUntil) {
    warnings.push(`(Pacote) Data de inicio ${input.startDate} posterior ao fim da disponibilidade (${p.availableUntil}).`);
  }
  if (p?.minDuration != null && input.quantity < p.minDuration) {
    warnings.push(`(Pacote) Quantidade ${input.quantity} abaixo da duracao minima (${p.minDuration}).`);
  }
  if (p?.maxDuration != null && input.quantity > p.maxDuration) {
    warnings.push(`(Pacote) Quantidade ${input.quantity} acima da duracao maxima (${p.maxDuration}).`);
  }

  const resultados: ItemPacoteResultado[] = [];
  const fees: FeeLine[] = [];
  const discounts: DiscountLine[] = [];
  const seasonal: SeasonalLine[] = [];
  const nets: number[] = [];
  const grosses: number[] = [];

  items.forEach((it, i) => {
    const priced = priceProduct({ ...it.request, fees: taxas[i], promotions: promocoesPorItem[i] });

    // Sem tabela vigente o motor devolve warning bloqueante e zeros: no pacote
    // isso vira recusa do todo — um pacote barato demais em silencio e pior.
    const bloqueado = (priced.breakdown as { source?: string } | undefined)?.source === "blocked";
    if (bloqueado || priced.grossAmount <= 0) {
      const motivo = (priced.breakdown as { error?: string } | undefined)?.error;
      throw new ErroPacote(
        `Pacote "${input.packageName}" sem preco: o item "${it.name}" nao tem tabela de preco vigente para esta data/duracao${motivo ? ` (${motivo})` : ""}.`,
      );
    }

    for (const f of priced.fees) {
      // Taxa unica por cotacao e a matricula fundida pertencem ao pacote todo;
      // as demais, ao item que as gerou.
      const doPacote = f.basis === "once_per_quote" || f.basis.startsWith("registration:");
      fees.push(doPacote ? f : { ...f, name: comItem(f.name, it.name) });
    }
    for (const d of priced.discounts) discounts.push({ ...d, name: comItem(d.name, it.name) });
    for (const s of priced.seasonal ?? []) seasonal.push({ ...s, name: comItem(s.name, it.name) });
    for (const w of [...priced.warnings, ...(it.extraWarnings ?? [])]) warnings.push(avisoDoItem(it.name, w));

    grosses.push(priced.grossAmount);
    nets.push(priced.netAmount);
    resultados.push({
      productId: it.itemProductId,
      name: it.name,
      quantity: it.request.quantity,
      quantityFactor: it.quantityFactor,
      billableQuantity: priced.billableQuantity,
      deliveredQuantity: priced.deliveredQuantity,
      endDate: priced.endDate,
      grossAmount: priced.grossAmount,
      averageUnitPrice: priced.averageUnitPrice,
      netAmount: priced.netAmount,
      breakdown: priced.breakdown,
    });
  });

  const grossAmount = sumMoney(grosses);
  const netAmount = sumMoney(nets);
  const billableQuantity = Math.max(...resultados.map((r) => r.billableQuantity));
  const deliveredQuantity = Math.max(...resultados.map((r) => r.deliveredQuantity));
  const endDate = resultados.map((r) => r.endDate).reduce((a, b) => (b > a ? b : a));
  if (new Set(resultados.map((r) => r.deliveredQuantity)).size > 1) {
    warnings.push(
      "Os itens do pacote tem duracoes entregues diferentes (promocao de semanas gratuitas em apenas um deles): confira o periodo.",
    );
  }

  const seasonalTotal = sumMoney(seasonal.map((s) => s.amount));
  return {
    billableQuantity,
    deliveredQuantity,
    endDate,
    grossAmount,
    averageUnitPrice: averageUnitPrice(grossAmount, billableQuantity),
    currency: items[0].request.product.currency,
    fees,
    discounts,
    ...(seasonal.length > 0 ? { seasonal } : {}),
    netAmount,
    items: resultados,
    breakdown: {
      source: "package_sum_of_items",
      packageName: input.packageName,
      quantity: input.quantity,
      unit: input.unit,
      startDate: input.startDate,
      multiCourseRule: input.multiCourseRule,
      items: resultados,
      fees,
      discounts,
      ...(seasonal.length > 0 ? { seasonal, seasonalTotal } : {}),
    },
    warnings,
  };
}
