// Separação das taxas do produto entre COBRADAS e apenas OFERECIDAS.
//
// `fee.is_mandatory` existia desde o início, era editável nas telas do hub e
// era gravada — mas o motor de preço nunca a lia: carregava todas as taxas
// vinculadas ao produto e somava todas. Uma taxa marcada como opcional (um
// transfer de aeroporto de US$ 275, por exemplo) entrava calada na conta de
// todo estudante, com a tela dizendo o contrário.
//
// NB: módulo PURO — sem dependência de rede/DB. Testado em taxa-opcional.test.ts.
import type { FeeChargeBasis } from "./pricing";

/** Bases aceitas, espelhando o CHECK de `fee.charge_basis`. */
const BASES: readonly FeeChargeBasis[] = ["once_per_quote", "once_per_item", "per_unit", "per_person"];

/** Taxa normalizada, na forma que o motor de preço consome. */
export type TaxaNormalizada = {
  id: string;
  name: string;
  feeType: string;
  chargeBasis: FeeChargeBasis;
  amount: number;
  currency: string;
  isRefundable?: boolean;
};

/** Linha crua de `fee` vinda do PostgREST (numeric chega como string). */
export type LinhaTaxa = Record<string, unknown>;

export type OpcoesSeparacao = {
  /** Data de início do item, para conferir a vigência da taxa. */
  startDate: string;
  /** Moeda do template, usada quando a taxa não declara a própria. */
  moedaPadrao: string;
  /** Taxas opcionais que o consultor escolheu incluir (fee.id). */
  escolhidas: string[];
};

/**
 * Duas regras que não são óbvias:
 *
 * - `is_mandatory` NULO conta como obrigatória. O padrão seguro é continuar
 *   cobrando; uma taxa desaparece da conta só quando alguém a marcou como
 *   opcional de propósito.
 * - uma opcional escolhida pelo consultor volta a ser cobrada E sai da lista de
 *   oferta — senão a tela ofereceria de novo o que já está na conta.
 *
 * Vigência e escopo v1 (só taxa com `amount` fixo) são aplicados antes da
 * separação: taxa fora de vigência não é cobrada NEM oferecida.
 */
export function separarTaxas(
  linhas: LinhaTaxa[],
  opts: OpcoesSeparacao,
): { cobradas: TaxaNormalizada[]; opcionais: TaxaNormalizada[] } {
  const escolhidas = new Set(opts.escolhidas);
  const cobradas: TaxaNormalizada[] = [];
  const opcionais: TaxaNormalizada[] = [];

  for (const f of linhas) {
    if (f.amount == null) continue; // fora do escopo v1 (price_template_id)
    // `feeRawAmount` no motor e um switch SEM default: uma base fora do
    // conjunto devolveria undefined e contaminaria o total com NaN. O CHECK da
    // coluna ja fecha o conjunto, mas o dado vem do banco como texto livre —
    // conferir aqui custa nada e fecha a porta.
    const base = f.charge_basis as FeeChargeBasis;
    if (!BASES.includes(base)) continue;
    const de = f.valid_from as string | null | undefined;
    const ate = f.valid_until as string | null | undefined;
    if (de != null && opts.startDate < de) continue;
    if (ate != null && opts.startDate > ate) continue;

    const taxa: TaxaNormalizada = {
      id: f.id as string,
      name: f.name as string,
      feeType: f.fee_type as string,
      chargeBasis: base,
      amount: Number(f.amount),
      currency: (f.currency as string | null) ?? opts.moedaPadrao,
      isRefundable: (f.is_refundable as boolean | null | undefined) ?? undefined,
    };

    if (f.is_mandatory === false && !escolhidas.has(taxa.id)) {
      opcionais.push(taxa);
      continue;
    }
    cobradas.push(taxa);
  }

  return { cobradas, opcionais };
}
