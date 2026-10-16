// Contas a receber de COMISSAO das escolas (PURO, sem rede/DB).
//
// Cenario: o aluno pagou o programa DIRETO a escola; a EXP Tour fatura a comissao
// a ela. Aqui ficam as regras que nao dependem de banco: calculo da comissao a
// partir do acordo, validacao da entrada, estado exibido (parcial/vencida) e
// saldo. O que grava dinheiro (recebimento) fica no servico, por RPC atomica.

export type TipoComissao = "percent" | "fixed_per_sale" | "fixed_per_week";
export type BaseComissao = "tuition" | "tuition_plus_fees" | "total" | "none";

export type StatusFatura = "rascunho" | "emitida" | "enviada" | "paga" | "cancelada";
export type StatusExibicao = "rascunho" | "emitida" | "enviada" | "parcial" | "vencida" | "paga" | "cancelada";

const PRAZO_PADRAO_DIAS = 30;

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

// Parse estrito de YYYY-MM-DD -> epoch dias (UTC); null se invalido.
function diasEpoch(iso: unknown): number | null {
  if (typeof iso !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return Math.floor(dt.getTime() / 86_400_000);
}

export function somarDiasISO(iso: string, dias: number): string | null {
  const d = diasEpoch(iso);
  if (d === null) return null;
  const dt = new Date((d + dias) * 86_400_000);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

/** Dias de `de` ate `ate` (positivo = `ate` e depois). null se alguma data for invalida. */
export function diferencaDias(de: string, ate: string): number | null {
  const a = diasEpoch(de);
  const b = diasEpoch(ate);
  return a === null || b === null ? null : b - a;
}

export type EntradaComissao = {
  /** Valor sobre o qual a comissao incide (o que o aluno pagou a escola, ou a parte da base do acordo). */
  base: number;
  currency: string;
  type: TipoComissao;
  value: number; // percentual (0-100) OU valor fixo
  acordoCurrency?: string | null;
  weeks?: number | null;
};

/**
 * Comissao a cobrar. Retorna null quando nao da para calcular com seguranca
 * (nunca "adivinha"): valor fixo em moeda diferente da da fatura, ou fixo por
 * semana sem numero de semanas. A comissao nunca excede a base.
 */
export function calcularComissaoFatura(e: EntradaComissao): number | null {
  const base = num(e.base);
  const value = num(e.value);
  if (base === null || base <= 0 || value === null || value < 0) return null;

  let c: number | null = null;
  if (e.type === "percent") {
    c = round2((base * Math.min(value, 100)) / 100);
  } else {
    const moedaAcordo = (e.acordoCurrency || "").toUpperCase().trim();
    const moeda = (e.currency || "").toUpperCase().trim();
    if (moedaAcordo && moeda && moedaAcordo !== moeda) return null;
    if (e.type === "fixed_per_sale") {
      c = round2(value);
    } else if (e.type === "fixed_per_week") {
      const w = num(e.weeks);
      if (w === null || w <= 0) return null;
      c = round2(value * w);
    }
  }
  if (c === null) return null;
  return Math.min(c, round2(base));
}

export type EntradaNovaFatura = {
  supplierId?: unknown;
  contratoId?: unknown;
  currency?: unknown;
  studentName?: unknown;
  programName?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  weeks?: unknown;
  paidToSchoolAmount?: unknown;
  paidToSchoolAt?: unknown;
  commissionBasis?: unknown;
  commissionType?: unknown;
  commissionValue?: unknown;
  /** Ajuste manual: sobrescreve o valor calculado. */
  commissionAmount?: unknown;
  notes?: unknown;
};

export type FaturaNormalizada = {
  supplierId: string;
  contratoId: string | null;
  currency: string;
  studentName: string | null;
  programName: string | null;
  startDate: string | null;
  endDate: string | null;
  weeks: number | null;
  paidToSchoolAmount: number;
  paidToSchoolAt: string | null;
  commissionBasis: BaseComissao | null;
  commissionType: TipoComissao | null;
  commissionValue: number | null;
  commissionAmount: number;
  notes: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BASES: readonly string[] = ["tuition", "tuition_plus_fees", "total", "none"];
const TIPOS: readonly string[] = ["percent", "fixed_per_sale", "fixed_per_week"];

function txt(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
  return s ? s.slice(0, max) : null;
}

function dataOpcional(v: unknown): { ok: true; valor: string | null } | { ok: false } {
  if (v === null || v === undefined || v === "") return { ok: true, valor: null };
  return diasEpoch(v) === null ? { ok: false } : { ok: true, valor: String(v).trim() };
}

/** Valida e normaliza a entrada do formulario. Erro em portugues, seguro para a tela. */
export function validarNovaFatura(e: EntradaNovaFatura): { ok: true; valor: FaturaNormalizada } | { ok: false; erro: string } {
  const supplierId = typeof e.supplierId === "string" ? e.supplierId.trim() : "";
  if (!UUID.test(supplierId)) return { ok: false, erro: "Escolha a escola." };
  let contratoId: string | null = null;
  if (e.contratoId !== undefined && e.contratoId !== null && e.contratoId !== "") {
    if (typeof e.contratoId !== "string" || !UUID.test(e.contratoId.trim())) return { ok: false, erro: "Caso inválido." };
    contratoId = e.contratoId.trim();
  }
  const currency = typeof e.currency === "string" ? e.currency.toUpperCase().trim() : "";
  if (!/^[A-Z]{3}$/.test(currency)) return { ok: false, erro: "Informe a moeda (3 letras, ex.: CAD)." };

  const pago = num(e.paidToSchoolAmount);
  if (pago === null || pago <= 0) return { ok: false, erro: "Informe o valor que o aluno pagou à escola." };

  const datas: Record<string, string | null> = {};
  for (const [k, v, rotulo] of [
    ["start", e.startDate, "data de início"],
    ["end", e.endDate, "data de término"],
    ["paidAt", e.paidToSchoolAt, "data do pagamento"],
  ] as const) {
    const r = dataOpcional(v);
    if (!r.ok) return { ok: false, erro: `Confira a ${rotulo} (AAAA-MM-DD).` };
    datas[k] = r.valor;
  }
  if (datas.start && datas.end && datas.end < datas.start) return { ok: false, erro: "O término não pode ser antes do início." };

  const weeksRaw = num(e.weeks);
  if (e.weeks !== undefined && e.weeks !== null && e.weeks !== "" && (weeksRaw === null || weeksRaw <= 0 || weeksRaw > 200)) {
    return { ok: false, erro: "Número de semanas inválido." };
  }

  let basis: BaseComissao | null = null;
  if (e.commissionBasis !== undefined && e.commissionBasis !== null && e.commissionBasis !== "") {
    if (typeof e.commissionBasis !== "string" || !BASES.includes(e.commissionBasis)) return { ok: false, erro: "Base da comissão inválida." };
    basis = e.commissionBasis as BaseComissao;
  }
  let type: TipoComissao | null = null;
  if (e.commissionType !== undefined && e.commissionType !== null && e.commissionType !== "") {
    if (typeof e.commissionType !== "string" || !TIPOS.includes(e.commissionType)) return { ok: false, erro: "Tipo de comissão inválido." };
    type = e.commissionType as TipoComissao;
  }
  const valorAcordo = num(e.commissionValue);
  if (e.commissionValue !== undefined && e.commissionValue !== null && e.commissionValue !== "" && (valorAcordo === null || valorAcordo < 0)) {
    return { ok: false, erro: "Valor da comissão inválido." };
  }

  // Comissao: ajuste manual vence; senao calcula pelo acordo informado.
  let comissao: number | null = num(e.commissionAmount);
  if (e.commissionAmount !== undefined && e.commissionAmount !== null && e.commissionAmount !== "" && (comissao === null || comissao < 0)) {
    return { ok: false, erro: "Valor da comissão inválido." };
  }
  if (comissao === null && type && valorAcordo !== null) {
    comissao = calcularComissaoFatura({ base: pago, currency, type, value: valorAcordo, weeks: weeksRaw });
  }
  if (comissao === null) return { ok: false, erro: "Não foi possível calcular a comissão: informe o valor da comissão." };
  comissao = round2(comissao);
  if (comissao <= 0) return { ok: false, erro: "A comissão deve ser maior que zero." };
  if (comissao > round2(pago)) return { ok: false, erro: "A comissão não pode ser maior que o valor pago à escola." };

  return {
    ok: true,
    valor: {
      supplierId,
      contratoId,
      currency,
      studentName: txt(e.studentName, 200),
      programName: txt(e.programName, 300),
      startDate: datas.start,
      endDate: datas.end,
      weeks: weeksRaw,
      paidToSchoolAmount: round2(pago),
      paidToSchoolAt: datas.paidAt,
      commissionBasis: basis,
      commissionType: type,
      commissionValue: valorAcordo,
      commissionAmount: comissao,
      notes: txt(e.notes, 1000),
    },
  };
}

export type FaturaParaStatus = {
  status: StatusFatura;
  due_date: string | null;
  commission_amount: number | string;
  received_amount: number | string;
};

export function saldoFatura(f: Pick<FaturaParaStatus, "commission_amount" | "received_amount">): number {
  return round2(Math.max(0, Number(f.commission_amount) - Number(f.received_amount)));
}

/** Estado mostrado ao usuario: parcial e vencida sao derivados (nao ficam gravados). */
export function statusExibicao(f: FaturaParaStatus, hojeISO: string): { status: StatusExibicao; diasAtraso: number } {
  if (f.status === "rascunho" || f.status === "cancelada" || f.status === "paga") return { status: f.status, diasAtraso: 0 };
  const dias = f.due_date ? diferencaDias(f.due_date, hojeISO) : null;
  const atraso = dias !== null && dias > 0 ? dias : 0;
  if (atraso > 0) return { status: "vencida", diasAtraso: atraso };
  if (Number(f.received_amount) > 0) return { status: "parcial", diasAtraso: 0 };
  return { status: f.status, diasAtraso: 0 };
}

/** Vencimento padrao da fatura: emissao + prazo (dias). */
export function vencimentoPadrao(emissaoISO: string, prazoDias: number | null | undefined): string | null {
  const p = prazoDias !== null && prazoDias !== undefined && Number.isFinite(prazoDias) && prazoDias >= 0 ? Math.floor(prazoDias) : PRAZO_PADRAO_DIAS;
  return somarDiasISO(emissaoISO, p);
}

// ── Dados do emissor (tenant_config.fatura_emissor) ──────────────────────────

export type EmissorFatura = {
  legalName: string;
  address: string;
  taxId: string;
  email: string;
  paymentInstructions: string;
  paymentTermsDays: number | null;
};

export function normalizarEmissor(raw: unknown): { ok: true; valor: EmissorFatura } | { ok: false; erro: string } {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const legalName = txt(o.legalName, 200);
  const email = txt(o.email, 200);
  const instrucoes = txt(o.paymentInstructions, 2000);
  if (!legalName) return { ok: false, erro: "Informe a razão social." };
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, erro: "Informe um e-mail de contato válido." };
  if (!instrucoes) return { ok: false, erro: "Informe as instruções de pagamento (dados bancários)." };
  const prazoRaw = num(o.paymentTermsDays);
  if (o.paymentTermsDays !== undefined && o.paymentTermsDays !== null && o.paymentTermsDays !== "" && (prazoRaw === null || prazoRaw < 0 || prazoRaw > 365)) {
    return { ok: false, erro: "Prazo de pagamento inválido (0 a 365 dias)." };
  }
  return {
    ok: true,
    valor: {
      legalName,
      address: txt(o.address, 500) ?? "",
      taxId: txt(o.taxId, 80) ?? "",
      email,
      paymentInstructions: instrucoes,
      paymentTermsDays: prazoRaw === null ? null : Math.floor(prazoRaw),
    },
  };
}

// ── Lembretes de cobranca (decisao pura; o envio e do servico/cron) ──────────

export type TipoLembrete = "a_vencer" | "vence_hoje" | "vencida_1" | "vencida_15" | "vencida_30";

/**
 * Marco de lembrete ALCANCADO pela fatura hoje (o mais avancado), ou null. Quem decide
 * se ja foi enviado e a chave de idempotencia (um e-mail por marco): se um dia nao
 * houve envio (cron fora do ar, escola sem contato), o marco continua devido no dia
 * seguinte e e reenviado — nenhum marco se perde por ser "so de um dia".
 *  - de 3 dias antes ate o dia anterior ao vencimento: a_vencer
 *  - no dia: vence_hoje
 *  - 1 a 14 dias de atraso: vencida_1 | 15 a 29: vencida_15 | 30 ou mais: vencida_30
 */
export function lembreteDevido(f: FaturaParaStatus, hojeISO: string): TipoLembrete | null {
  if (f.status !== "emitida" && f.status !== "enviada") return null;
  if (saldoFatura(f) <= 0 || !f.due_date) return null;
  const d = diferencaDias(hojeISO, f.due_date); // positivo = faltam d dias
  if (d === null) return null;
  if (d > 3) return null;
  if (d > 0) return "a_vencer";
  if (d === 0) return "vence_hoje";
  const atraso = -d;
  if (atraso >= 30) return "vencida_30";
  if (atraso >= 15) return "vencida_15";
  return "vencida_1";
}
