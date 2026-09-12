// Motor PURO do snapshot imutável do Anexo III (Cláusula 18.2 / spec "Anexo III":
// AnexoIII_Emitido). Congela, no momento da EMISSÃO, o retrato dos itens da
// Política de Pagamento dos Fornecedores daquele contrato + hash de integridade.
// O que vale para o cliente é o anexo EMITIDO, não a política vigente na escola
// hoje — isto sustenta a defesa quando a escola altera a política depois.
//
// Espelha o padrão do Quadro Resumo (quadro-resumo.ts): montar + serializar
// canônico; o hash (sha256 da forma canônica) é calculado no serviço.
//
// SEM imports (nem "@/..." nem extensão): roda direto no runner nativo do Node
// (node --test, type-stripping). Puro e determinístico para o hash ser estável.

export const ANEXO_III_SCHEMA_VERSAO = 1;

export type AnexoIIIItemEntrada = {
  fornecedor: string | null;
  natureza: string | null;
  valor: number | null;
  moeda: string | null;
  prazo: string | null;
  evento: string | null;
  documento_viabiliza: string | null;
  consequencia_atraso: string | null;
  politica_cancelamento: string | null;
  fonte: string | null;
  ordem: number | null;
};

export type AnexoIIIItemSnapshot = {
  fornecedor: string;
  natureza: string | null;
  valor: number | null;
  moeda: string | null;
  prazo: string | null;
  evento: string | null;
  documento_viabiliza: string | null;
  consequencia_atraso: string | null;
  politica_cancelamento: string | null;
  fonte: string | null;
  ordem: number;
};

export type AnexoIIISnapshot = {
  schema_versao: number;
  emitido_em: string; // ISO timestamp da emissão
  // Versões das políticas de campus referenciadas (III.3 / spec): vazio por ora,
  // campo aberto para quando o Anexo III passar a referenciar snapshots de política.
  politicas_referenciadas: string[];
  itens: AnexoIIIItemSnapshot[];
};

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function txt(v: string | null | undefined): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
}

// Comparação byte-a-byte (não depende de locale/ICU): a ordenação — e portanto o
// hash — precisa ser idêntica em qualquer ambiente.
function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function montarAnexoIIISnapshot(
  itens: AnexoIIIItemEntrada[],
  opts: { emitidoEm: string; politicasReferenciadas?: string[] },
): AnexoIIISnapshot {
  const norm: AnexoIIIItemSnapshot[] = (itens ?? []).map((i) => ({
    fornecedor: txt(i.fornecedor) ?? "",
    natureza: txt(i.natureza),
    valor: i.valor == null || !Number.isFinite(Number(i.valor)) ? null : round2(Number(i.valor)),
    moeda: txt(i.moeda) ? String(i.moeda).toUpperCase().trim() : null,
    prazo: txt(i.prazo),
    evento: txt(i.evento),
    documento_viabiliza: txt(i.documento_viabiliza),
    consequencia_atraso: txt(i.consequencia_atraso),
    politica_cancelamento: txt(i.politica_cancelamento),
    fonte: txt(i.fonte),
    ordem: Number.isFinite(Number(i.ordem)) ? Number(i.ordem) : 0,
  }));

  // Ordenação determinística: o hash não pode depender da ordem de linhas do
  // banco NEM do locale/ICU do ambiente. Comparação byte-a-byte (cmp) em vez de
  // localeCompare; e desempate TOTAL (serializa a linha inteira) para eliminar
  // empates residuais que cairiam na ordem instável de retorno do banco.
  norm.sort((a, b) =>
    a.ordem - b.ordem ||
    cmp(a.fornecedor, b.fornecedor) ||
    cmp(a.natureza ?? "", b.natureza ?? "") ||
    cmp(a.prazo ?? "", b.prazo ?? "") ||
    cmp(JSON.stringify(a), JSON.stringify(b)),
  );

  return {
    schema_versao: ANEXO_III_SCHEMA_VERSAO,
    emitido_em: opts.emitidoEm,
    politicas_referenciadas: [...(opts.politicasReferenciadas ?? [])].map(String).sort(),
    itens: norm,
  };
}

// Serialização CANÔNICA (chaves ordenadas recursivamente) para o hash ser
// estável: mesmo conteúdo, montado em ordem de chave diferente, produz a MESMA
// string (e o mesmo hash).
export function serializarAnexoIIISnapshot(valor: unknown): string {
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
