// Entidades NOVAS do Anexo III / v3.1 que NÃO existem no código atual —
// complementam (não substituem) o motor de retenção já pronto em
// `politica-retencao.ts` (escada por campus) e o `reembolso-service.ts`.
//
// Cobre, do spec `docs/forio-especificacao-anexo3-sistema.md`:
//   - Componente Educacional (Cláusula 1.1.g.1): base da Remuneração por Serviços
//     Prestados, ≠ Custo do Programa (§3.3-A);
//   - TaxaObrigatoria: compõe a Entrada, por campus, com condição de aplicação,
//     reembolsável e componente (§3.2);
//   - ExigenciaAntecipacao: REGRA por campus que ATIVA a Cláusula 7.5 (§3.3) —
//     distinta da tabela `antecipacoes`, que é a instância por-contrato;
//   - EscolaCampusPolitica: campos de política do campus (intake máximo vendável,
//     reembolso destinatário/prazo/forma/crédito, proteção estudantil, fonte da
//     política) que estendem `campus` (§3.1).
//
// PURO e AUTOCONTIDO (sem imports @/): testável por node --test. O teto de 800 é
// constante na Moeda de Referência (§5), nunca convertido/travado em reais.

// ── Enums fechados ───────────────────────────────────────────────────────────

// Âncoras de PRAZO/EXIGÊNCIA (data-limite = âncora + unidade + valor). Inclui
// assinatura e reserva, que a escada de retenção incumbente ainda não modela
// (ver nota de extensão em politica-retencao). Alinha o naming do campo de curso
// com o incumbente ("inicio_curso").
export const ANCORAS_PRAZO = ["inicio_curso", "chegada_acomodacao", "assinatura", "reserva"] as const;
export type AncoraPrazo = (typeof ANCORAS_PRAZO)[number];

export const UNIDADES_PRAZO = ["dias_corridos", "dias_uteis", "semanas"] as const;
export type UnidadePrazo = (typeof UNIDADES_PRAZO)[number];

export const COMPONENTES = ["educacional", "terceiro"] as const;
export type Componente = (typeof COMPONENTES)[number];

export const CONDICOES_APLICACAO = [
  "sempre",
  "com_acomodacao",
  "com_residencia",
  "duracao_min",
  "destino_especifico",
] as const;
export type CondicaoAplicacao = (typeof CONDICOES_APLICACAO)[number];

export const EVENTOS_GERADORES = [
  "emissao_documento_visto",
  "confirmacao_reserva",
  "manutencao_reserva",
] as const;
export type EventoGerador = (typeof EVENTOS_GERADORES)[number];

export const REEMBOLSO_FORMAS = ["dinheiro", "credito"] as const;
export type ReembolsoForma = (typeof REEMBOLSO_FORMAS)[number];

export const REEMBOLSO_DESTINATARIOS = ["agencia", "aluno"] as const;
export type ReembolsoDestinatario = (typeof REEMBOLSO_DESTINATARIOS)[number];

export const PROTECOES_ESTUDANTIL = ["conta_fiduciaria", "fundo", "garantia", "nenhum"] as const;
export type ProtecaoEstudantil = (typeof PROTECOES_ESTUDANTIL)[number];

export const POLITICA_FONTES = ["contrato_representacao", "site"] as const;
export type PoliticaFonte = (typeof POLITICA_FONTES)[number];

// Teto absoluto da Remuneração por Serviços Prestados (item I.2.1 / §5): 800
// unidades da MOEDA DE REFERÊNCIA, em qualquer degrau/data. Config, não cravado.
export const TETO_REMUNERACAO_MOEDA_REFERENCIA = 800;

// ── Resultado de validação ───────────────────────────────────────────────────

export type Falha = { campo: string; erro: string };
export type Resultado<T> = { ok: true; valor: T } | { ok: false; erros: Falha[] };

// ── Helpers puros ────────────────────────────────────────────────────────────

function ehObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
function intNaoNeg(v: unknown): number | null {
  const n = num(v);
  if (n === null || n < 0 || !Number.isInteger(n)) return null;
  return n;
}
function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}
function ehMoeda(v: unknown): boolean {
  return typeof v === "string" && /^[A-Za-z]{3}$/.test(v.trim());
}
function moedaNorm(v: unknown): string {
  return str(v).toUpperCase();
}
function em<T extends readonly string[]>(lista: T, v: unknown): v is T[number] {
  return typeof v === "string" && (lista as readonly string[]).includes(v);
}
function ehDataISO(v: unknown): boolean {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v);
}

// ── ItemDoPrograma + Componente Educacional (Cláusula 1.1.g.1) ───────────────

export type ItemDoPrograma = {
  programaId: string;
  fornecedorId: string | null;
  descricao: string;
  valor: number;
  moeda: string;
  componente: Componente;
};

export function validarItemDoPrograma(raw: unknown): Resultado<ItemDoPrograma> {
  const erros: Falha[] = [];
  const p = ehObj(raw) ? raw : {};
  const programaId = str(p.programaId);
  if (!programaId) erros.push({ campo: "programaId", erro: "obrigatório" });
  const descricao = str(p.descricao);
  if (!descricao) erros.push({ campo: "descricao", erro: "obrigatório" });
  const valor = num(p.valor);
  if (valor === null || valor < 0) erros.push({ campo: "valor", erro: "inválido" });
  if (!ehMoeda(p.moeda)) erros.push({ campo: "moeda", erro: "moeda inválida (3 letras)" });
  const componente = em(COMPONENTES, p.componente) ? p.componente : null;
  if (!componente) erros.push({ campo: "componente", erro: "educacional|terceiro (Cláusula 1.1.g.1)" });
  if (erros.length) return { ok: false, erros };
  return {
    ok: true,
    valor: {
      programaId,
      fornecedorId: str(p.fornecedorId) || null,
      descricao,
      valor: valor!,
      moeda: moedaNorm(p.moeda),
      componente: componente!,
    },
  };
}

// Custo do Programa = soma de TODOS os itens. Assume itens na mesma moeda (o
// chamador garante; o motor de reembolso converte por pagamento).
export function custoDoPrograma(itens: Pick<ItemDoPrograma, "valor">[]): number {
  return itens.reduce((s, it) => s + (Number.isFinite(it.valor) ? it.valor : 0), 0);
}

// Componente Educacional = soma só dos itens `educacional`. É a BASE da
// Remuneração por Serviços Prestados — nunca o Custo do Programa (§3.3-A / I.2.8).
export function componenteEducacional(itens: Pick<ItemDoPrograma, "valor" | "componente">[]): number {
  return itens
    .filter((it) => it.componente === "educacional")
    .reduce((s, it) => s + (Number.isFinite(it.valor) ? it.valor : 0), 0);
}

// Aplica o teto absoluto (800 na Moeda de Referência) ao valor da Remuneração já
// apurado. Puro; o motor de reembolso (frente B) chama após o percentual sobre o
// Componente Educacional. NUNCA converte o teto para reais.
export function aplicarTetoRemuneracao(valorNaMoedaReferencia: number): number {
  if (!Number.isFinite(valorNaMoedaReferencia) || valorNaMoedaReferencia < 0) return 0;
  return Math.min(valorNaMoedaReferencia, TETO_REMUNERACAO_MOEDA_REFERENCIA);
}

// ── TaxaObrigatoria (compõe a Entrada, por campus) ───────────────────────────

export type TaxaObrigatoria = {
  escolaCampusId: string;
  nome: string;
  valor: number;
  moeda: string;
  condicaoAplicacao: CondicaoAplicacao;
  reembolsavel: boolean;
  vencimentoDias: number; // assinatura + N dias corridos
  componente: Componente;
};

export function validarTaxaObrigatoria(raw: unknown): Resultado<TaxaObrigatoria> {
  const erros: Falha[] = [];
  const p = ehObj(raw) ? raw : {};
  const escolaCampusId = str(p.escolaCampusId);
  if (!escolaCampusId) erros.push({ campo: "escolaCampusId", erro: "obrigatório" });
  const nome = str(p.nome);
  if (!nome) erros.push({ campo: "nome", erro: "obrigatório" });
  const valor = num(p.valor);
  if (valor === null || valor < 0) erros.push({ campo: "valor", erro: "inválido" });
  if (!ehMoeda(p.moeda)) erros.push({ campo: "moeda", erro: "moeda inválida (3 letras)" });
  const condicaoAplicacao = em(CONDICOES_APLICACAO, p.condicaoAplicacao) ? p.condicaoAplicacao : null;
  if (!condicaoAplicacao) erros.push({ campo: "condicaoAplicacao", erro: "inválida" });
  const componente = em(COMPONENTES, p.componente) ? p.componente : null;
  if (!componente) erros.push({ campo: "componente", erro: "educacional|terceiro" });
  const vencimentoDias = intNaoNeg(p.vencimentoDias);
  if (vencimentoDias === null) erros.push({ campo: "vencimentoDias", erro: "inteiro não negativo" });
  const reembolsavel = typeof p.reembolsavel === "boolean" ? p.reembolsavel : null;
  if (reembolsavel === null) erros.push({ campo: "reembolsavel", erro: "booleano obrigatório" });
  if (erros.length) return { ok: false, erros };
  return {
    ok: true,
    valor: {
      escolaCampusId,
      nome,
      valor: valor!,
      moeda: moedaNorm(p.moeda),
      condicaoAplicacao: condicaoAplicacao!,
      reembolsavel: reembolsavel!,
      vencimentoDias: vencimentoDias!,
      componente: componente!,
    },
  };
}

// Contexto que diz quais condições de aplicação estão satisfeitas na contratação.
export type ContextoAplicacao = {
  temAcomodacao?: boolean;
  temResidencia?: boolean;
  duracaoSemanas?: number | null;
  duracaoMinima?: number | null;
  destinoEspecifico?: boolean;
};

export function taxaAplicavel(taxa: Pick<TaxaObrigatoria, "condicaoAplicacao">, ctx: ContextoAplicacao): boolean {
  switch (taxa.condicaoAplicacao) {
    case "sempre":
      return true;
    case "com_acomodacao":
      return !!ctx.temAcomodacao;
    case "com_residencia":
      return !!ctx.temResidencia;
    case "duracao_min":
      return ctx.duracaoSemanas != null && ctx.duracaoMinima != null && ctx.duracaoSemanas >= ctx.duracaoMinima;
    case "destino_especifico":
      return !!ctx.destinoEspecifico;
    default:
      return false;
  }
}

// Entrada = soma das taxas APLICÁVEIS, por moeda (pode misturar moedas; o
// chamador converte na cobrança). Só entram as que passam em `taxaAplicavel`.
export function entradaPorMoeda(
  taxas: Pick<TaxaObrigatoria, "condicaoAplicacao" | "valor" | "moeda">[],
  ctx: ContextoAplicacao,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of taxas) {
    if (!taxaAplicavel(t, ctx)) continue;
    out[t.moeda] = Math.round(((out[t.moeda] ?? 0) + t.valor) * 100) / 100;
  }
  return out;
}

// ── ExigenciaAntecipacao (REGRA por campus que ativa a Cláusula 7.5) ─────────

export type ExigenciaAntecipacao = {
  escolaCampusId: string;
  ativa: boolean;
  eventoGerador: EventoGerador;
  documentoViabilizado: string;
  valor: number | null; // exatamente um de valor / percentual
  percentual: number | null;
  moeda: string | null; // exigido quando `valor` presente
  dataLimiteAncora: AncoraPrazo;
  dataLimiteUnidade: UnidadePrazo;
  dataLimiteValor: number;
  comprovanteRef: string | null; // obrigatório quando ativa (Cláusula 7.5.1)
  condicao: string | null;
};

export function validarExigenciaAntecipacao(raw: unknown): Resultado<ExigenciaAntecipacao> {
  const erros: Falha[] = [];
  const p = ehObj(raw) ? raw : {};
  const escolaCampusId = str(p.escolaCampusId);
  if (!escolaCampusId) erros.push({ campo: "escolaCampusId", erro: "obrigatório" });
  const ativa = typeof p.ativa === "boolean" ? p.ativa : false;
  const eventoGerador = em(EVENTOS_GERADORES, p.eventoGerador) ? p.eventoGerador : null;
  if (!eventoGerador) erros.push({ campo: "eventoGerador", erro: "inválido" });
  const documentoViabilizado = str(p.documentoViabilizado);
  if (!documentoViabilizado) erros.push({ campo: "documentoViabilizado", erro: "obrigatório" });

  const valor = p.valor == null ? null : num(p.valor);
  const percentual = p.percentual == null ? null : num(p.percentual);
  if (valor === null && percentual === null) {
    erros.push({ campo: "valor", erro: "informe valor ou percentual" });
  } else if (valor !== null && percentual !== null) {
    erros.push({ campo: "valor", erro: "informe apenas um: valor ou percentual" });
  }
  if (valor !== null && valor < 0) erros.push({ campo: "valor", erro: "negativo" });
  if (percentual !== null && (percentual < 0 || percentual > 100)) erros.push({ campo: "percentual", erro: "fora de 0..100" });
  let moeda: string | null = null;
  if (valor !== null) {
    if (!ehMoeda(p.moeda)) erros.push({ campo: "moeda", erro: "obrigatória quando há valor" });
    else moeda = moedaNorm(p.moeda);
  }

  const dataLimiteAncora = em(ANCORAS_PRAZO, p.dataLimiteAncora) ? p.dataLimiteAncora : null;
  if (!dataLimiteAncora) erros.push({ campo: "dataLimiteAncora", erro: "inválida" });
  const dataLimiteUnidade = em(UNIDADES_PRAZO, p.dataLimiteUnidade) ? p.dataLimiteUnidade : null;
  if (!dataLimiteUnidade) erros.push({ campo: "dataLimiteUnidade", erro: "inválida" });
  const dataLimiteValor = num(p.dataLimiteValor);
  if (dataLimiteValor === null) erros.push({ campo: "dataLimiteValor", erro: "numérico obrigatório" });

  // Cláusula 7.5.1: exigência ATIVA precisa de comprovante (lastro documental).
  const comprovanteRef = str(p.comprovanteRef) || null;
  if (ativa && !comprovanteRef) {
    erros.push({ campo: "comprovanteRef", erro: "exigência ativa requer comprovante (Cláusula 7.5.1)" });
  }

  if (erros.length) return { ok: false, erros };
  return {
    ok: true,
    valor: {
      escolaCampusId,
      ativa,
      eventoGerador: eventoGerador!,
      documentoViabilizado,
      valor,
      percentual,
      moeda,
      dataLimiteAncora: dataLimiteAncora!,
      dataLimiteUnidade: dataLimiteUnidade!,
      dataLimiteValor: dataLimiteValor!,
      comprovanteRef,
      condicao: str(p.condicao) || null,
    },
  };
}

// ── EscolaCampusPolitica (estende `campus`) ──────────────────────────────────

export type EscolaCampusPolitica = {
  escolaCampusId: string;
  moeda: string;
  calendarioFeriadosPais: string | null; // país (casa com tabela `feriado`.pais) p/ regras em dias úteis
  intakeMaximoVendavel: string | null; // ISO date: até quando há preço confirmado
  prazoPagamentoAncora: AncoraPrazo;
  prazoPagamentoUnidade: UnidadePrazo;
  prazoPagamentoValor: number;
  reembolsoDestinatario: ReembolsoDestinatario;
  reembolsoPrazoDias: number;
  reembolsoForma: ReembolsoForma;
  creditoValidadeMeses: number | null; // quando forma = credito
  creditoTransferivel: boolean;
  creditoEscopo: string | null;
  politicaFonte: PoliticaFonte;
  politicaUrl: string | null;
  politicaSnapshotRef: string | null;
  politicaVersao: string | null;
  politicaData: string | null; // ISO date
  protecaoEstudantil: ProtecaoEstudantil;
};

export function validarEscolaCampusPolitica(raw: unknown): Resultado<EscolaCampusPolitica> {
  const erros: Falha[] = [];
  const p = ehObj(raw) ? raw : {};
  const escolaCampusId = str(p.escolaCampusId);
  if (!escolaCampusId) erros.push({ campo: "escolaCampusId", erro: "obrigatório" });
  if (!ehMoeda(p.moeda)) erros.push({ campo: "moeda", erro: "moeda inválida (3 letras)" });

  const prazoPagamentoAncora = em(ANCORAS_PRAZO, p.prazoPagamentoAncora) ? p.prazoPagamentoAncora : null;
  if (!prazoPagamentoAncora) erros.push({ campo: "prazoPagamentoAncora", erro: "inválida" });
  const prazoPagamentoUnidade = em(UNIDADES_PRAZO, p.prazoPagamentoUnidade) ? p.prazoPagamentoUnidade : null;
  if (!prazoPagamentoUnidade) erros.push({ campo: "prazoPagamentoUnidade", erro: "inválida" });
  const prazoPagamentoValor = num(p.prazoPagamentoValor);
  if (prazoPagamentoValor === null) erros.push({ campo: "prazoPagamentoValor", erro: "numérico obrigatório" });

  const reembolsoDestinatario = em(REEMBOLSO_DESTINATARIOS, p.reembolsoDestinatario) ? p.reembolsoDestinatario : null;
  if (!reembolsoDestinatario) erros.push({ campo: "reembolsoDestinatario", erro: "agencia|aluno" });
  const reembolsoForma = em(REEMBOLSO_FORMAS, p.reembolsoForma) ? p.reembolsoForma : null;
  if (!reembolsoForma) erros.push({ campo: "reembolsoForma", erro: "dinheiro|credito" });
  const reembolsoPrazoDias = intNaoNeg(p.reembolsoPrazoDias);
  if (reembolsoPrazoDias === null) erros.push({ campo: "reembolsoPrazoDias", erro: "inteiro não negativo" });

  let creditoValidadeMeses: number | null = null;
  if (reembolsoForma === "credito") {
    creditoValidadeMeses = intNaoNeg(p.creditoValidadeMeses);
    if (creditoValidadeMeses === null || creditoValidadeMeses <= 0) {
      erros.push({ campo: "creditoValidadeMeses", erro: "validade (meses) obrigatória quando forma=credito" });
    }
  }
  const creditoTransferivel = typeof p.creditoTransferivel === "boolean" ? p.creditoTransferivel : false;

  const politicaFonte = em(POLITICA_FONTES, p.politicaFonte) ? p.politicaFonte : null;
  if (!politicaFonte) erros.push({ campo: "politicaFonte", erro: "contrato_representacao|site" });
  const protecaoEstudantil = em(PROTECOES_ESTUDANTIL, p.protecaoEstudantil) ? p.protecaoEstudantil : null;
  if (!protecaoEstudantil) erros.push({ campo: "protecaoEstudantil", erro: "inválida" });

  const intakeMaximoVendavel = str(p.intakeMaximoVendavel) || null;
  if (intakeMaximoVendavel && !ehDataISO(intakeMaximoVendavel)) erros.push({ campo: "intakeMaximoVendavel", erro: "data ISO" });

  // Regras em dias úteis exigem o país do calendário (§2.2 usa o calendário do
  // país DA ESCOLA, não do Brasil).
  const calendarioFeriadosPais = str(p.calendarioFeriadosPais) || null;
  if (prazoPagamentoUnidade === "dias_uteis" && !calendarioFeriadosPais) {
    erros.push({ campo: "calendarioFeriadosPais", erro: "regra em dias úteis exige país do calendário" });
  }

  if (erros.length) return { ok: false, erros };
  return {
    ok: true,
    valor: {
      escolaCampusId,
      moeda: moedaNorm(p.moeda),
      calendarioFeriadosPais,
      intakeMaximoVendavel,
      prazoPagamentoAncora: prazoPagamentoAncora!,
      prazoPagamentoUnidade: prazoPagamentoUnidade!,
      prazoPagamentoValor: prazoPagamentoValor!,
      reembolsoDestinatario: reembolsoDestinatario!,
      reembolsoPrazoDias: reembolsoPrazoDias!,
      reembolsoForma: reembolsoForma!,
      creditoValidadeMeses,
      creditoTransferivel,
      creditoEscopo: str(p.creditoEscopo) || null,
      politicaFonte: politicaFonte!,
      politicaUrl: str(p.politicaUrl) || null,
      politicaSnapshotRef: str(p.politicaSnapshotRef) || null,
      politicaVersao: str(p.politicaVersao) || null,
      politicaData: str(p.politicaData) || null,
      protecaoEstudantil: protecaoEstudantil!,
    },
  };
}

// Bloqueio §7 / máquina de estados 5: proposta com início posterior ao horizonte
// de preço confirmado deve ser RECUSADA (não desaconselhada). Puro: compara datas
// ISO. `intakeMaximoVendavel` null = sem horizonte cadastrado => não bloqueia.
export function inicioAlemDoIntake(inicioCursoISO: string, intakeMaximoVendavel: string | null): boolean {
  if (!intakeMaximoVendavel || !ehDataISO(inicioCursoISO) || !ehDataISO(intakeMaximoVendavel)) return false;
  return inicioCursoISO.slice(0, 10) > intakeMaximoVendavel.slice(0, 10);
}
