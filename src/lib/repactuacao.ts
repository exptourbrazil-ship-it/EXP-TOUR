// Motor PURO da REPACTUACAO do cronograma de parcelas (Clausula 7.11). O cliente
// redistribui o SALDO em moeda estrangeira entre as parcelas FUTURAS (a divida
// nunca reduz — so muda de forma), pela Area do Cliente, com guarda-corpos
// validados SEMPRE no servidor. O aceite eletronico do Termo vale como aditivo
// (o registro do antes/depois + data/hora/IP e a prova).
//
// Escopo deste modulo: validacao (guarda-corpos), o snapshot canonico do
// cronograma (antes/depois) e o texto DETERMINISTICO do Termo (para o hash). Nao
// toca banco nem decide dinheiro — so calcula e valida.
//
// SEM imports (nem "@/..." nem extensao): roda no runner nativo do Node e e
// testavel isolado.

// Padroes (a CONFIRMAR pelo negocio / config por instancia — TENANT):
//   - ate 2 repactuacoes self-service por trimestre; a 3a+ exige aprovacao humana
//   - a proxima parcela a vencer so pode ser mexida ate D-3 do vencimento
//   - valor minimo por parcela: 0 = desabilitado (config define na moeda do programa)
export const LIMITE_SELF_SERVICE_TRIMESTRE_PADRAO = 2;
export const DIAS_MIN_PROXIMA_PARCELA_PADRAO = 3;
export const VALOR_MINIMO_PARCELA_PADRAO = 0;

// Tolerancia (moeda do programa) na conferencia da soma. Espelha parcelas.ts.
export const TOLERANCIA_SOMA = 0.01;

export type ParcelaAtual = {
  id: string;
  numero: number;
  valorAtual: number;
  vencimento: string; // YYYY-MM-DD
  status: string; // pendente | pago | atrasado
  temCobranca: boolean; // qr_code_url preenchido (Pix ja gerado)
  isEntrada: boolean;
};

export type ParcelaNova = {
  id?: string; // presente = parcela existente; ausente = nova
  numero: number;
  descricao?: string;
  valor: number;
  vencimento: string; // YYYY-MM-DD
};

export type ConfigRepactuacao = {
  valorMinimoParcela: number; // 0 = sem minimo
  limiteSelfServiceTrimestre: number;
  diasMinProximaParcela: number;
};

export const CONFIG_REPACTUACAO_PADRAO: ConfigRepactuacao = {
  valorMinimoParcela: VALOR_MINIMO_PARCELA_PADRAO,
  limiteSelfServiceTrimestre: LIMITE_SELF_SERVICE_TRIMESTRE_PADRAO,
  diasMinProximaParcela: DIAS_MIN_PROXIMA_PARCELA_PADRAO,
};

export type ValidacaoRepactuacao =
  | { ok: true; exigeAprovacao: boolean; totalPlano: number }
  | { ok: false; motivo: string; detalhe?: string };

function round2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}
function somaValores(vals: number[]): number {
  return round2(vals.reduce((a, v) => a + (Number(v) || 0), 0));
}
function diasEntreISO(aISO: string, bISO: string): number {
  const a = Date.parse((aISO || "").slice(0, 10) + "T00:00:00Z");
  const b = Date.parse((bISO || "").slice(0, 10) + "T00:00:00Z");
  if (!Number.isFinite(a) || !Number.isFinite(b)) return NaN;
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}
// Parcela "bloqueada" para edicao/remocao: paga ou com Pix ja gerado.
function bloqueada(p: ParcelaAtual): boolean {
  return p.status === "pago" || !!p.temCobranca;
}
// Parcela em atraso: marcada 'atrasado' OU nao paga com vencimento no passado.
function emAtraso(p: ParcelaAtual, hojeISO: string): boolean {
  if (p.status === "pago") return false;
  if (p.status === "atrasado") return true;
  const d = diasEntreISO(p.vencimento, hojeISO);
  return Number.isFinite(d) && d > 0; // hoje > vencimento
}

// Valida a repactuacao proposta. Retorna motivo (codigo) no primeiro problema —
// insumo do evento Repactuacao_Bloqueada. Quando OK, `exigeAprovacao` indica se
// esta repactuacao ja passou do limite self-service do trimestre (3a+ => humano).
export function validarRepactuacao(args: {
  atuais: ParcelaAtual[];
  novas: ParcelaNova[];
  valorTotal: number; // moeda do programa
  dataInicio: string | null; // moeda do programa
  hojeISO: string;
  repactuacoesNoTrimestre: number; // ja confirmadas neste trimestre
  config?: Partial<ConfigRepactuacao>;
  tolerancia?: number;
}): ValidacaoRepactuacao {
  const cfg: ConfigRepactuacao = { ...CONFIG_REPACTUACAO_PADRAO, ...(args.config || {}) };
  const tol = args.tolerancia ?? TOLERANCIA_SOMA;
  const atuais = Array.isArray(args.atuais) ? args.atuais : [];
  const novas = Array.isArray(args.novas) ? args.novas : [];
  const hoje = args.hojeISO;

  if (novas.length === 0) return { ok: false, motivo: "sem_parcelas" };

  // Guarda 1: qualquer parcela em atraso trava o editor (regularizar antes).
  if (atuais.some((p) => emAtraso(p, hoje))) {
    return { ok: false, motivo: "parcela_em_atraso" };
  }

  const atuaisPorId = new Map(atuais.map((p) => [p.id, p]));
  const idsRecebidos = new Set(novas.filter((p) => p.id).map((p) => p.id as string));

  // Guarda 2: cada parcela com id tem de existir; parcelas bloqueadas (paga/Pix)
  // nao podem ser alteradas.
  for (const p of novas) {
    if (typeof p.valor !== "number" || !Number.isFinite(p.valor) || p.valor <= 0) {
      return { ok: false, motivo: "valor_invalido" };
    }
    if (!p.vencimento || p.vencimento.length < 10) return { ok: false, motivo: "vencimento_invalido" };
    if (p.id) {
      const at = atuaisPorId.get(p.id);
      if (!at) return { ok: false, motivo: "parcela_nao_encontrada", detalhe: p.id };
      if (bloqueada(at) && (round2(p.valor) !== round2(at.valorAtual) || p.vencimento !== at.vencimento)) {
        return { ok: false, motivo: "parcela_bloqueada_alterada", detalhe: p.id };
      }
    }
  }

  // Guarda 3: parcelas bloqueadas nao podem ser removidas.
  for (const at of atuais) {
    if (bloqueada(at) && !idsRecebidos.has(at.id)) {
      return { ok: false, motivo: "parcela_bloqueada_removida", detalhe: at.id };
    }
  }

  // Guarda 4: valor minimo por parcela (quando configurado > 0). Vale so para as
  // NAO bloqueadas (as pagas mantem o valor historico).
  if (cfg.valorMinimoParcela > 0) {
    for (const p of novas) {
      const at = p.id ? atuaisPorId.get(p.id) : undefined;
      const ehBloqueada = at ? bloqueada(at) : false;
      if (!ehBloqueada && round2(p.valor) < round2(cfg.valorMinimoParcela)) {
        return { ok: false, motivo: "valor_abaixo_minimo", detalhe: String(cfg.valorMinimoParcela) };
      }
    }
  }

  // Guarda 5: a proxima parcela a vencer so pode ser mexida ate D-min. Uma parcela
  // NAO bloqueada que vence dentro de [hoje, hoje+diasMin) nao pode ser alterada
  // nem removida (o Pix do vencimento e gerado com a cotacao do dia; mexer em cima
  // da hora quebra a regua). Idem: nao criar parcela nova vencendo nesse intervalo.
  const dMin = cfg.diasMinProximaParcela;
  for (const at of atuais) {
    if (bloqueada(at)) continue;
    const dias = diasEntreISO(hoje, at.vencimento);
    const iminente = Number.isFinite(dias) && dias >= 0 && dias < dMin;
    if (!iminente) continue;
    const correspondente = novas.find((n) => n.id === at.id);
    if (!correspondente) return { ok: false, motivo: "parcela_iminente_removida", detalhe: at.id };
    if (round2(correspondente.valor) !== round2(at.valorAtual) || correspondente.vencimento !== at.vencimento) {
      return { ok: false, motivo: "parcela_iminente_alterada", detalhe: at.id };
    }
  }
  for (const p of novas) {
    if (p.id && atuaisPorId.has(p.id)) continue; // parcela nova apenas
    const dias = diasEntreISO(hoje, p.vencimento);
    if (Number.isFinite(dias) && dias >= 0 && dias < dMin) {
      return { ok: false, motivo: "nova_parcela_iminente", detalhe: p.vencimento };
    }
  }

  // Guarda 6: nenhum vencimento no passado — EXCETO parcelas bloqueadas (pagas/Pix),
  // que legitimamente carregam datas passadas e ja foram provadas inalteradas.
  for (const p of novas) {
    const at = p.id ? atuaisPorId.get(p.id) : undefined;
    if (at && bloqueada(at)) continue;
    if (p.vencimento < hoje) return { ok: false, motivo: "vencimento_no_passado", detalhe: p.vencimento };
  }

  // Guarda 7: a soma do novo plano tem de bater com o total do contrato (a divida
  // se redistribui, nunca reduz). Pulada quando valorTotal ausente (legado).
  if (args.valorTotal != null && Number(args.valorTotal) > 0) {
    const total = somaValores(novas.map((p) => p.valor));
    if (Math.abs(total - round2(args.valorTotal)) > tol) {
      return { ok: false, motivo: "soma_diverge", detalhe: `${total} != ${round2(args.valorTotal)}` };
    }
  }

  // Guarda 8: regra dos 30 dias — o ultimo vencimento tem de ser <= inicio-30.
  if (args.dataInicio && args.dataInicio.length >= 10) {
    const inicioMs = Date.parse(args.dataInicio.slice(0, 10) + "T00:00:00Z");
    const limiteMs = inicioMs - 30 * 24 * 60 * 60 * 1000;
    const limiteISO = new Date(limiteMs).toISOString().slice(0, 10);
    const ultimo = novas.reduce((max, p) => (p.vencimento > max ? p.vencimento : max), "");
    if (ultimo > limiteISO) {
      return { ok: false, motivo: "regra_30_dias", detalhe: limiteISO };
    }
  }

  const total = somaValores(novas.map((p) => p.valor));
  const exigeAprovacao = args.repactuacoesNoTrimestre >= cfg.limiteSelfServiceTrimestre;
  return { ok: true, exigeAprovacao, totalPlano: total };
}

// Snapshot CANONICO do cronograma para o registro antes/depois (prova do aditivo).
// Ordena por numero e mantem so os campos que definem o cronograma.
export type LinhaCronograma = { numero: number; vencimento: string; valor: number; status?: string };

export function montarSnapshotCronograma(
  parcelas: Array<{ numero: number; vencimento: string; valor: number; status?: string }>,
): LinhaCronograma[] {
  return (Array.isArray(parcelas) ? parcelas : [])
    .map((p) => ({
      numero: Number(p.numero) || 0,
      vencimento: (p.vencimento || "").slice(0, 10),
      valor: round2(p.valor),
      ...(p.status ? { status: p.status } : {}),
    }))
    .sort((a, b) => a.numero - b.numero);
}

// Texto DETERMINISTICO do Termo de Repactuacao (sem data/hora) — base do hash
// SHA-256 que prova o que o cliente aceitou. O aceite eletronico vale como aditivo.
export function renderizarTermoRepactuacao(d: {
  moeda: string;
  cronogramaAnterior: LinhaCronograma[];
  cronogramaNovo: LinhaCronograma[];
}): string {
  const moeda = (d.moeda || "").toUpperCase() || "BRL";
  const fmt = (v: number) => `${moeda} ${round2(v).toFixed(2)}`;
  const linhas = (c: LinhaCronograma[]) =>
    (c || []).map((p) => `- Parcela ${p.numero} (${p.vencimento}): ${fmt(p.valor)}`);
  const totalAntes = somaValores((d.cronogramaAnterior || []).map((p) => p.valor));
  const totalNovo = somaValores((d.cronogramaNovo || []).map((p) => p.valor));
  return [
    "TERMO DE REPACTUACAO DE PARCELAS",
    "",
    "Cronograma anterior:",
    ...linhas(d.cronogramaAnterior),
    `Total anterior: ${fmt(totalAntes)}`,
    "",
    "Novo cronograma:",
    ...linhas(d.cronogramaNovo),
    `Total novo: ${fmt(totalNovo)}`,
    "",
    "A divida em moeda estrangeira e a mesma — apenas redistribuida entre as",
    "parcelas acima. Ao aceitar, o CONTRATANTE concorda com o novo cronograma,",
    "valendo o registro eletronico deste aceite como aditivo ao contrato (Clausula",
    "7.11), observados os limites contratuais.",
  ].join("\n");
}
