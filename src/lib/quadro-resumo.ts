// Motor PURO do Quadro Resumo do aceite (Clausula 17.1 / contrato-arquitetura
// item 3). Congela, no momento do aceite, o retrato dos dados CONTRATADOS que o
// cliente viu e marcou: contratante, participante, programa, valores, regime de
// pagamento (parcelas), itens da opcao e a versao do Termo. O "documento aceito"
// = Condicoes Gerais (versao+hash) + ESTE Quadro Resumo (snapshot+hash) + Anexos.
//
// SEM imports (nem "@/..." nem extensao): roda direto no runner nativo do Node
// (node --test, type-stripping) sem resolver modulos. Mantido puro e deterministico
// para o hash de integridade ser estavel e reproduzivel.

export const QUADRO_RESUMO_SCHEMA_VERSAO = 1;

export type ParcelaEntrada = {
  numero: number;
  descricao?: string | null;
  valor: number;
  vencimento: string; // ISO (YYYY-MM-DD)
  is_entrada?: boolean | null;
};

export type ItemEntrada = {
  grupo: string;
  nome: string | null;
  valor: number;
  moeda: string;
  startDate: string | null;
  fornecedor: string | null;
};

export type QuadroResumoInput = {
  contratante: { nome: string; cpf: string; email: string; telefone: string | null };
  participante: { nome: string | null; paisDestino: string | null };
  programa: {
    nome: string;
    fornecedor: string | null;
    referencia: string;
    opcaoIndice: number; // 0-based (indice da opcao escolhida)
    dataInicio: string | null;
  };
  valores: { moeda: string; total: number; entrada: number };
  parcelas: ParcelaEntrada[];
  itens: ItemEntrada[];
  termo: { versao: string; hash: string };
  geradoEm: string; // ISO timestamp do ato do aceite
};

export type QuadroResumo = {
  schema_versao: number;
  contratante: { nome: string; cpf_mascarado: string; email: string; telefone_mascarado: string | null };
  participante: { nome: string | null; pais_destino: string | null };
  programa: {
    nome: string;
    fornecedor: string | null;
    referencia: string;
    opcao_numero: number; // 1-based, para leitura humana
    data_inicio: string | null;
  };
  valores: { moeda: string; total: number; entrada: number; saldo: number };
  regime_pagamento: {
    quantidade: number;
    total: number;
    parcelas: Array<{ numero: number; descricao: string; valor: number; vencimento: string; is_entrada: boolean }>;
  };
  itens: Array<{ grupo: string; nome: string | null; valor: number; moeda: string; data_inicio: string | null; fornecedor: string | null }>;
  termo: { versao: string; hash: string };
  gerado_em: string;
};

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

// So digitos. Mascara CPF preservando o formato brasileiro e revelando apenas os
// 3 primeiros e os 2 ultimos (checagem): 123.***.***-00. Minimiza PII duplicada
// no snapshot (o CPF completo vive em `titulares`, ligavel por titular_id).
export function mascararCpf(cpf: string): string {
  const d = String(cpf || "").replace(/\D/g, "");
  if (d.length !== 11) return "***";
  return `${d.slice(0, 3)}.***.***-${d.slice(9, 11)}`;
}

// Telefone: revela apenas os 4 ultimos digitos. Sem digitos suficientes -> null.
export function mascararTelefone(tel: string | null): string | null {
  const d = String(tel || "").replace(/\D/g, "");
  if (d.length < 4) return null;
  return `••••${d.slice(-4)}`;
}

export function montarQuadroResumo(input: QuadroResumoInput): QuadroResumo {
  const parcelas = (input.parcelas ?? []).map((p) => ({
    numero: Number(p.numero) || 0,
    descricao: (p.descricao && String(p.descricao).trim()) || "Parcela",
    valor: round2(p.valor),
    vencimento: p.vencimento,
    is_entrada: !!p.is_entrada,
  }));
  const totalParcelas = round2(parcelas.reduce((s, p) => s + p.valor, 0));
  const total = round2(input.valores.total);
  const entrada = round2(input.valores.entrada);

  const itens = (input.itens ?? []).map((i) => ({
    grupo: i.grupo,
    nome: i.nome ?? null,
    valor: round2(i.valor),
    moeda: i.moeda,
    data_inicio: i.startDate ?? null,
    fornecedor: i.fornecedor ?? null,
  }));

  return {
    schema_versao: QUADRO_RESUMO_SCHEMA_VERSAO,
    contratante: {
      nome: String(input.contratante.nome || "").trim(),
      cpf_mascarado: mascararCpf(input.contratante.cpf),
      email: String(input.contratante.email || "").trim().toLowerCase(),
      telefone_mascarado: mascararTelefone(input.contratante.telefone),
    },
    participante: {
      nome: (input.participante.nome && String(input.participante.nome).trim()) || null,
      pais_destino: input.participante.paisDestino ?? null,
    },
    programa: {
      nome: String(input.programa.nome || "").trim(),
      fornecedor: input.programa.fornecedor ?? null,
      referencia: String(input.programa.referencia || ""),
      opcao_numero: (Number(input.programa.opcaoIndice) || 0) + 1,
      data_inicio: input.programa.dataInicio ?? null,
    },
    valores: {
      moeda: input.valores.moeda,
      total,
      entrada,
      saldo: round2(total - entrada),
    },
    regime_pagamento: {
      quantidade: parcelas.length,
      total: totalParcelas,
      parcelas,
    },
    itens,
    termo: { versao: String(input.termo.versao || ""), hash: String(input.termo.hash || "") },
    gerado_em: input.geradoEm,
  };
}

// Serializacao CANONICA (chaves ordenadas recursivamente) para o hash de
// integridade ser estavel: dois Quadros com o mesmo conteudo, montados em ordem
// de chave diferente, produzem a MESMA string (e o mesmo hash).
export function serializarQuadroResumo(valor: unknown): string {
  return JSON.stringify(ordenar(valor));
}

function ordenar(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(ordenar);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      out[k] = ordenar((v as Record<string, unknown>)[k]);
    }
    return out;
  }
  return v;
}
