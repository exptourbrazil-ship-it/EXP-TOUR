// Motor PURO do Documento Integral do contrato (Clausula 17.3 / Dec. 7.962):
// a "via integral" arquivavel = Condicoes Gerais (versao+texto) + Quadro Resumo
// (snapshot congelado no aceite) + Anexo II (metodologia de cambio) + Anexo III
// (politica dos fornecedores) + prova do aceite (data/hora, IP, versao, sessao).
//
// SEM imports (nem "@/..." nem extensao): roda no runner nativo do Node
// (node --test) sem resolver modulos. O snapshot do Quadro Resumo chega como
// jsonb solto do banco -> leitura DEFENSIVA (nunca confia no formato).
//
// A funcao apenas FORMATA dados ja carregados (posse conferida na data layer);
// nao acessa rede/DB e nao recalcula dinheiro (o snapshot ja esta congelado).

// ---- Tipos de entrada (frouxos: refletem o que a data layer entrega) --------
export type DocIntegralContrato = {
  id: string;
  nome: string;
  moeda: string;
  valorTotal: number;
  estudanteNome: string | null;
  paisDestino: string | null;
  dataInicio: string | null;
  criadoEm: string | null;
  canceladoEm: string | null;
  sessionId: string | null;
};
export type DocIntegralCondicoes = { versao: string; hash: string; conteudo: string } | null;
export type DocIntegralAnexoIIIItem = {
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
  ordem: number;
};
export type DocIntegralAceite = { dataHora: string; ip: string | null; versao: string; hashConteudo: string } | null;

export type DocumentoIntegralInput = {
  contrato: DocIntegralContrato;
  titularNome: string | null;
  quadroResumo: unknown; // snapshot jsonb (pode ser null / formato antigo)
  condicoesGerais: DocIntegralCondicoes;
  anexoIII: DocIntegralAnexoIIIItem[];
  aceite: DocIntegralAceite;
  // Parametros de cambio VIGENTES (Anexo II e texto legal; vem da config, nao
  // hardcoded aqui): fracoes, ex.: 0.05 e 0.035.
  spread: number;
  iof: number;
};

// ---- Saida (pronta para render; o componente so mapeia) ---------------------
export type Linha = { rotulo: string; valor: string };
export type Bloco = { titulo: string; linhas: Linha[] };

export type DocumentoIntegral = {
  titulo: string;
  referencia: string;
  geradoEm: string;
  cancelado: boolean;
  completo: boolean;
  avisos: string[];
  quadroResumo: { presente: boolean; blocos: Bloco[] };
  condicoesGerais: { presente: boolean; versao: string | null; hash: string | null; conteudo: string | null };
  anexoII: { formula: string; componentes: Linha[]; nota: string };
  anexoIII: { presente: boolean; itens: Bloco[] };
  aceite: { presente: boolean; linhas: Linha[] };
};

// ---- Helpers puros ----------------------------------------------------------
function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}
function s(v: unknown): string | null {
  if (v == null) return null;
  const t = String(v).trim();
  return t.length ? t : null;
}
function get(o: unknown, k: string): unknown {
  return o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined;
}

// Dinheiro deterministico (sem Intl): "CAD 1.234,56".
export function fmtDinheiro(valor: number, moeda: string | null): string {
  const neg = valor < 0;
  const cents = Math.round(Math.abs(valor) * 100);
  const inteiro = Math.floor(cents / 100).toString();
  const dec = (cents % 100).toString().padStart(2, "0");
  let comMilhar = "";
  for (let i = 0; i < inteiro.length; i++) {
    if (i > 0 && (inteiro.length - i) % 3 === 0) comMilhar += ".";
    comMilhar += inteiro[i];
  }
  const moe = (moeda || "").toUpperCase();
  return `${neg ? "-" : ""}${moe ? moe + " " : ""}${comMilhar},${dec}`;
}

function fmtData(iso: string | null): string {
  if (!iso || iso.length < 10) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}
function fmtDataHora(iso: string | null): string {
  if (!iso || iso.length < 10) return "—";
  const data = fmtData(iso);
  const hora = iso.length >= 16 ? iso.slice(11, 16) : "";
  return hora ? `${data} ${hora}` : data;
}
function pct(fracao: number): string {
  // 0.05 -> "5%"; 0.035 -> "3,5%"; 0.066 -> "6,6%". Arredonda a 3 casas para
  // matar ruido de ponto flutuante e apara zeros a direita.
  const v = Math.round(fracao * 100 * 1000) / 1000;
  const txt = (Number.isInteger(v) ? String(v) : String(v)).replace(".", ",");
  return `${txt}%`;
}

// ---- Blocos do Quadro Resumo a partir do snapshot ---------------------------
function blocosQuadroResumo(snap: unknown): Bloco[] {
  const blocos: Bloco[] = [];
  const contratante = get(snap, "contratante");
  if (contratante) {
    blocos.push({
      titulo: "Contratante",
      linhas: [
        { rotulo: "Nome", valor: s(get(contratante, "nome")) ?? "—" },
        { rotulo: "CPF", valor: s(get(contratante, "cpf_mascarado")) ?? "—" },
        { rotulo: "E-mail", valor: s(get(contratante, "email")) ?? "—" },
        { rotulo: "Telefone", valor: s(get(contratante, "telefone_mascarado")) ?? "—" },
      ],
    });
  }
  const participante = get(snap, "participante");
  if (participante) {
    blocos.push({
      titulo: "Participante",
      linhas: [
        { rotulo: "Nome", valor: s(get(participante, "nome")) ?? "—" },
        { rotulo: "Destino", valor: s(get(participante, "pais_destino")) ?? "—" },
      ],
    });
  }
  const programa = get(snap, "programa");
  if (programa) {
    blocos.push({
      titulo: "Programa",
      linhas: [
        { rotulo: "Programa", valor: s(get(programa, "nome")) ?? "—" },
        { rotulo: "Fornecedor", valor: s(get(programa, "fornecedor")) ?? "—" },
        { rotulo: "Referência", valor: s(get(programa, "referencia")) ?? "—" },
        { rotulo: "Opção", valor: get(programa, "opcao_numero") != null ? String(get(programa, "opcao_numero")) : "—" },
        { rotulo: "Início", valor: fmtData(s(get(programa, "data_inicio"))) },
      ],
    });
  }
  const valores = get(snap, "valores");
  if (valores) {
    const moeda = s(get(valores, "moeda"));
    blocos.push({
      titulo: "Valores",
      linhas: [
        { rotulo: "Moeda de referência", valor: moeda ?? "—" },
        { rotulo: "Total", valor: fmtDinheiro(n(get(valores, "total")), moeda) },
        { rotulo: "Entrada", valor: fmtDinheiro(n(get(valores, "entrada")), moeda) },
        { rotulo: "Saldo", valor: fmtDinheiro(n(get(valores, "saldo")), moeda) },
      ],
    });
  }
  const regime = get(snap, "regime_pagamento");
  const parcelas = get(regime, "parcelas");
  if (regime && Array.isArray(parcelas)) {
    const moedaVal = s(get(get(snap, "valores"), "moeda"));
    const linhas: Linha[] = parcelas.map((p) => ({
      rotulo: `${s(get(p, "descricao")) ?? "Parcela"} · venc. ${fmtData(s(get(p, "vencimento")))}`,
      valor: fmtDinheiro(n(get(p, "valor")), moedaVal),
    }));
    linhas.push({ rotulo: "Total do cronograma", valor: fmtDinheiro(n(get(regime, "total")), moedaVal) });
    blocos.push({ titulo: "Regime de pagamento", linhas });
  }
  const itens = get(snap, "itens");
  if (Array.isArray(itens) && itens.length) {
    const linhas: Linha[] = itens.map((it) => ({
      rotulo: `${s(get(it, "grupo")) ?? "item"} · ${s(get(it, "nome")) ?? "—"}${
        s(get(it, "fornecedor")) ? ` (${s(get(it, "fornecedor"))})` : ""
      }`,
      valor: fmtDinheiro(n(get(it, "valor")), s(get(it, "moeda"))),
    }));
    blocos.push({ titulo: "Itens da opção", linhas });
  }
  return blocos;
}

// ---- Anexo III --------------------------------------------------------------
function blocosAnexoIII(itens: DocIntegralAnexoIIIItem[]): Bloco[] {
  return itens
    .slice()
    .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))
    .map((it) => {
      const linhas: Linha[] = [];
      if (it.natureza) linhas.push({ rotulo: "Natureza", valor: it.natureza });
      if (it.valor != null) linhas.push({ rotulo: "Valor", valor: fmtDinheiro(n(it.valor), it.moeda) });
      if (it.prazo) linhas.push({ rotulo: "Prazo", valor: it.prazo });
      if (it.evento) linhas.push({ rotulo: "Evento", valor: it.evento });
      if (it.documento_viabiliza) linhas.push({ rotulo: "Documento que viabiliza", valor: it.documento_viabiliza });
      if (it.consequencia_atraso) linhas.push({ rotulo: "Consequência do atraso", valor: it.consequencia_atraso });
      if (it.politica_cancelamento) linhas.push({ rotulo: "Cancelamento", valor: it.politica_cancelamento });
      if (it.fonte) linhas.push({ rotulo: "Fonte", valor: it.fonte });
      return { titulo: it.fornecedor || "Fornecedor a confirmar", linhas };
    });
}

// ---- Montagem principal -----------------------------------------------------
export function montarDocumentoIntegral(input: DocumentoIntegralInput): DocumentoIntegral {
  const { contrato, quadroResumo, condicoesGerais, anexoIII, aceite } = input;

  const refSnap = s(get(get(quadroResumo, "programa"), "referencia"));
  const referencia = refSnap ?? contrato.nome ?? "—";

  const qrBlocos = blocosQuadroResumo(quadroResumo);
  const qrPresente = qrBlocos.length > 0;
  const cgPresente = !!(condicoesGerais && condicoesGerais.conteudo && condicoesGerais.conteudo.trim());
  const acPresente = !!aceite;

  const avisos: string[] = [];
  if (contrato.canceladoEm) avisos.push("Contrato cancelado — via mantida para arquivo e consulta.");
  if (!qrPresente) avisos.push("Quadro Resumo indisponível para este contrato (anterior ao snapshot no aceite).");
  if (!cgPresente) avisos.push("Texto das Condições Gerais indisponível nesta versão do Termo.");
  if (!acPresente) avisos.push("Prova de aceite não localizada para este contrato.");
  // Guarda da "via congelada": se o texto exibido nao e da MESMA versao provada
  // no aceite, avisa (evita apresentar uma versao vigente diferente da aceita —
  // p.ex. contrato antigo sem snapshot que caiu no termo vigente por fallback).
  if (acPresente && cgPresente && aceite!.versao && condicoesGerais!.versao && aceite!.versao !== condicoesGerais!.versao) {
    avisos.push(
      `Versão exibida das Condições Gerais (${condicoesGerais!.versao}) difere da registrada no aceite (${aceite!.versao}).`,
    );
  }

  const completo = qrPresente && cgPresente && acPresente;

  const aceiteLinhas: Linha[] = aceite
    ? [
        { rotulo: "Data e hora do aceite", valor: fmtDataHora(aceite.dataHora) },
        { rotulo: "Versão das Condições Gerais", valor: aceite.versao || "—" },
        { rotulo: "Impressão digital (hash SHA-256)", valor: aceite.hashConteudo || "—" },
        { rotulo: "Endereço IP", valor: aceite.ip || "—" },
        { rotulo: "Identificador de sessão", valor: contrato.sessionId || "—" },
        { rotulo: "Forma de assinatura", valor: "Marcação eletrônica (Cláusula 17.1)" },
      ]
    : [];

  return {
    titulo: "Contrato de Prestação de Serviços — Via Integral",
    referencia,
    geradoEm: fmtDataHora(new Date().toISOString()),
    cancelado: !!contrato.canceladoEm,
    completo,
    avisos,
    quadroResumo: { presente: qrPresente, blocos: qrBlocos },
    condicoesGerais: {
      presente: cgPresente,
      versao: condicoesGerais?.versao ?? null,
      hash: condicoesGerais?.hash ?? null,
      conteudo: cgPresente ? condicoesGerais!.conteudo : null,
    },
    anexoII: {
      formula: "Valor em BRL = Valor amortizado × PTAX_venda × (1 + Taxa de Intermediação e Câmbio + IOF-câmbio)",
      componentes: [
        { rotulo: "PTAX de venda", valor: "Banco Central do Brasil, na data de cada pagamento" },
        { rotulo: "Taxa de Intermediação e Câmbio", valor: pct(input.spread) + " (vigente)" },
        { rotulo: "IOF-câmbio", valor: pct(input.iof) + " (vigente, sobre o valor convertido)" },
        { rotulo: "Modelo", valor: `Aditivo — fator (1 + ${pct(input.spread)} + ${pct(input.iof)})` },
      ],
      nota:
        "A conversão para reais ocorre no dia de cada pagamento; a obrigação permanece na moeda de referência até a quitação. Percentuais vigentes na data — cobranças já geradas conservam os percentuais então aplicados.",
    },
    anexoIII: { presente: anexoIII.length > 0, itens: blocosAnexoIII(anexoIII) },
    aceite: { presente: acPresente, linhas: aceiteLinhas },
  };
}
