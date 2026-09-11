// Nucleo PURO do orcamento lead-facing (Forio Marketplace). Sem rede/DB, para
// ser testavel com o runner nativo do Node (ver CLAUDE.md). Cobre:
//  - busca por texto com expansao de sinonimos PT->EN + coringa profissional;
//  - filtro por duracao (semanas) e pais, com ranking por relevancia;
//  - montagem do orcamento itemizado na MOEDA DO CURSO (+ conversao BRL);
//  - plano de parcelamento PIX (entrada + N mensais), com nº de parcelas editavel.
//
// A precificacao "oficial" (motor + tabelas) vive em src/lib/pricing.ts; aqui e a
// aritmetica de apresentacao do simulador ao vivo (preco_semanal x semanas + taxas),
// que espelha os precos carregados no catalogo. Portado do handoff de design.

export type AcomodacaoPrecos = { residence?: number; homestay?: number } | null;

export type ProgramaOrcavel = {
  id: string;
  slug: string;
  courseName: string;
  courseType: string; // english-for-specific-purposes | qualification-english | english-for-professionals | english-plus
  city: string;
  country: string; // rotulo do pais (ex.: "UK", "Malta", "US")
  school: string; // display do fornecedor
  flag?: string;
  currency: string; // moeda do campus
  minWeeks: number;
  maxWeeks: number;
  fixedFee: boolean; // pacote fixo (wfee cobrado uma vez)
  wfee: number; // mensalidade semanal (ou total do pacote se fixedFee)
  appFee: number; // matricula (uma vez) — linha "matricula" do orcamento
  entradaMoeda?: number; // ENTRADA = soma das taxas NAO reembolsaveis (uma vez). Default = appFee.
  wmatFee: number; // material POR SEMANA
  accom: AcomodacaoPrecos; // preco semanal por tipo (por campus)
  insuranceWeekly: number; // seguro semanal (por campus)
};

export const CATEGORY_LABEL: Record<string, string> = {
  "english-for-specific-purposes": "Inglês para Fins Específicos",
  "qualification-english": "Inglês com Certificação",
  "english-for-professionals": "Inglês para Profissionais",
  "english-plus": "English Plus (curso + atividades)",
};

// Mapa PT->EN: traduz o termo digitado para as palavras-chave que existem na base.
export const SEARCH_SYNONYMS: Array<{ pt: string[]; en: string[] }> = [
  { pt: ["médic", "medicina", "saúde", "healthcare", "oet"], en: ["medical", "health", "nursing", "oet"] },
  { pt: ["enfermagem", "enfermeir"], en: ["nursing"] },
  { pt: ["negóci", "executiv"], en: ["business", "executive", "professional"] },
  { pt: ["profission"], en: ["professional", "executive"] },
  { pt: ["liderança", "lideranca", "líder", "lider"], en: ["professional", "executive"] },
  { pt: ["aviação", "aviaç", "piloto", "aeroporto", "drone"], en: ["aviation", "flight attendants", "drone"] },
  { pt: ["turismo", "hotelaria"], en: ["tourism", "hospitality"] },
  { pt: ["direito", "jurídic", "juridic", "advoga"], en: ["legal"] },
  { pt: ["contabil", "finança", "financ", "banc"], en: ["accounting", "finance", "banking"] },
  { pt: ["marketing", "venda"], en: ["marketing", "sales", "professional"] },
  { pt: ["tecnologia", "informátic", "ti ", "cibernétic", "ciberseguranç"], en: ["it", "information technology", "computing", "cyber security"] },
  { pt: ["administra"], en: ["administration"] },
  { pt: ["professor", "ensino", "certificaç", "certificad"], en: ["teaching"] },
  { pt: ["rh", "recursos human"], en: ["hr", "human resources"] },
  { pt: ["estágio", "internato", "intern"], en: ["internship"] },
  { pt: ["filmagem", "cinema"], en: ["filmmaking"] },
  { pt: ["atuação", "ator", "atriz"], en: ["acting"] },
  { pt: ["moda", "fashion"], en: ["fashion"] },
  { pt: ["dança"], en: ["dancing"] },
  { pt: ["música"], en: ["music"] },
  { pt: ["inteligência artificial", " ia ", "i.a."], en: ["ai"] },
  { pt: ["construção", "construcao"], en: ["construction"] },
  { pt: ["agricultura", "agrícola"], en: ["agriculture"] },
  { pt: ["fotografia"], en: ["photography"] },
  { pt: ["militar"], en: ["military"] },
  { pt: ["marítimo", "naval"], en: ["maritime"] },
  { pt: ["petróleo", "petroleo", "gás", "gas natural"], en: ["oil and gas"] },
  { pt: ["mineração", "mineracao", "mineraç"], en: ["mining"] },
  { pt: ["imobiliári", "imoveis", "imóveis"], en: ["real estate"] },
  { pt: ["jornalismo", "jornalista"], en: ["journalism"] },
  { pt: ["seguros", "seguradora"], en: ["insurance companies"] },
  { pt: ["infantil", "crianças", "criancas", "creche"], en: ["childcare"] },
  { pt: ["atendimento ao cliente", "relacionamento com cliente"], en: ["customer service", "customer relations"] },
  { pt: ["público", "publico"], en: ["public admin", "public speaking"] },
  { pt: ["taxista", "táxi"], en: ["taxi drivers"] },
  { pt: ["energia"], en: ["energy"] },
  { pt: ["redes sociais"], en: ["social media"] },
  { pt: ["comissári", "aeromoça"], en: ["flight attendants"] },
  { pt: ["relações internacionais", "relacoes internacionais", "diplomacia"], en: ["international affairs"] },
  { pt: ["gestão", "gestao"], en: ["management", "professional"] },
  { pt: ["automotivo", "carros", "automóve"], en: ["automotive"] },
  { pt: ["alimentos", "bebidas", "gastronomia"], en: ["food and beverage"] },
  { pt: ["engenharia"], en: ["engineering", "engireeing"] },
  { pt: ["apresentaç", "apresentacoes"], en: ["presentations", "public speaking"] },
  { pt: ["seguro de viagem", "seguro saúde"], en: [] },
];

// Termos genericos de contexto corporativo: acionam o coringa dos cursos
// english-for-professionals mesmo sem match textual direto.
export const GENERIC_PROFESSIONAL_TERMS = [
  "profission", "corporat", "empresari", "trabalho", "carreira", "escritório", "escritorio",
  "reunião", "reuniao", "negocia", "colega", "chefe", "emprego", "empresa", "cliente",
  "apresentação", "apresentacao", "e-mail", "email profissional", "entrevista de emprego",
  "comunicação corporativa", "comunicacao corporativa", "networking", "time", "equipe",
];

// Normaliza: trim, minuscula, remove acentos (NFD + strip diacriticos).
export function normalizar(s: string): string {
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

// Expande o termo digitado: retorna o termo normalizado + todas as palavras-chave
// EN das regras cujo lado PT casa (contains) com o termo.
export function expandirTermos(query: string): string[] {
  const termo = normalizar(query);
  if (!termo) return [];
  const out = new Set<string>([termo]);
  for (const regra of SEARCH_SYNONYMS) {
    if (regra.pt.some((p) => termo.includes(normalizar(p)) || normalizar(p).includes(termo))) {
      for (const en of regra.en) out.add(normalizar(en));
    }
  }
  return [...out];
}

export type FaixaFora = { courseName: string; school: string; minWeeks: number; maxWeeks: number };
export type ResultadoBusca = { resultados: ProgramaOrcavel[]; foraDaFaixa: FaixaFora[] };

// score de relevancia: 0 nome, 1 escola, 2 coringa profissional, 3 sem termo.
function scoreRelevancia(p: ProgramaOrcavel, termos: string[], coringa: boolean): number | null {
  if (termos.length === 0) return 3;
  const nome = normalizar(p.courseName);
  const escola = normalizar(p.school);
  const tipo = normalizar(p.courseType);
  const cat = normalizar(CATEGORY_LABEL[p.courseType] || "");
  const casa = (hay: string) => termos.some((t) => hay.includes(t));
  if (casa(nome)) return 0;
  if (casa(escola)) return 1;
  if (casa(tipo) || casa(cat)) return 0;
  if (coringa && p.courseType === "english-for-professionals") return 2;
  return null;
}

// Filtra + ordena os programas conforme os criterios do lead. Programas que
// batem no termo/pais mas falham na duracao alimentam `foraDaFaixa` (aviso), e
// NUNCA aparecem em `resultados`.
export function filtrarProgramas(args: {
  programas: ProgramaOrcavel[];
  termo: string;
  weeks: number | null;
  country?: string; // rotulo do pais; vazio/undefined = todos
}): ResultadoBusca {
  const termos = expandirTermos(args.termo);
  const termoNorm = normalizar(args.termo);
  const coringa = !!termoNorm && GENERIC_PROFESSIONAL_TERMS.some((g) => termoNorm.includes(normalizar(g)));
  const paisFiltro = args.country && args.country !== "todos" ? args.country : null;

  const candidatos: Array<{ p: ProgramaOrcavel; score: number }> = [];
  const fora: FaixaFora[] = [];

  for (const p of args.programas) {
    if (paisFiltro && p.country !== paisFiltro) continue;
    const score = scoreRelevancia(p, termos, coringa);
    if (score === null) continue; // nao casa o termo
    const naFaixa = args.weeks != null && args.weeks >= p.minWeeks && args.weeks <= p.maxWeeks;
    if (naFaixa) candidatos.push({ p, score });
    else if (termos.length > 0) fora.push({ courseName: p.courseName, school: p.school, minWeeks: p.minWeeks, maxWeeks: p.maxWeeks });
  }

  candidatos.sort((a, b) => a.score - b.score || a.p.courseName.localeCompare(b.p.courseName, "pt-BR"));
  return { resultados: candidatos.map((c) => c.p), foraDaFaixa: fora };
}

function round2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

export type OpcoesOrcamento = {
  weeks: number;
  accomOn: boolean;
  accomType: "residence" | "homestay";
  insuranceOn: boolean;
};

export type LinhaOrcamento = { chave: string; rotulo: string; valor: number };
export type Orcamento = {
  currency: string;
  linhas: LinhaOrcamento[]; // apenas as > 0
  curso: number;
  acomodacao: number;
  matricula: number;
  material: number;
  seguro: number;
  totalMoeda: number;
};

// Monta o orcamento itemizado na MOEDA DO CURSO. Curso = wfee (uma vez se pacote
// fixo) ou wfee x semanas. Matricula uma vez; material e seguro x semanas;
// acomodacao x semanas pelo tipo escolhido. So inclui linhas > 0.
export function montarOrcamento(p: ProgramaOrcavel, o: OpcoesOrcamento): Orcamento {
  const weeks = Math.max(0, Math.floor(o.weeks || 0));
  const curso = p.wfee > 0 ? (p.fixedFee ? p.wfee : p.wfee * weeks) : 0;
  const accomWeekly = o.accomOn && p.accom ? Number(p.accom[o.accomType] || 0) : 0;
  const acomodacao = accomWeekly > 0 ? accomWeekly * weeks : 0;
  const matricula = p.appFee > 0 ? p.appFee : 0;
  const material = p.wmatFee > 0 ? p.wmatFee * weeks : 0;
  const seguro = o.insuranceOn && p.insuranceWeekly > 0 ? p.insuranceWeekly * weeks : 0;

  const linhasBrutas: LinhaOrcamento[] = [
    { chave: "curso", rotulo: p.fixedFee ? "Curso (pacote)" : "Curso", valor: round2(curso) },
    { chave: "acomodacao", rotulo: "Acomodação", valor: round2(acomodacao) },
    { chave: "matricula", rotulo: "Taxa de matrícula", valor: round2(matricula) },
    { chave: "material", rotulo: "Material didático", valor: round2(material) },
    { chave: "seguro", rotulo: "Seguro saúde", valor: round2(seguro) },
  ];
  const linhas = linhasBrutas.filter((l) => l.valor > 0);
  const totalMoeda = round2(linhas.reduce((s, l) => s + l.valor, 0));

  return {
    currency: p.currency,
    linhas,
    curso: round2(curso),
    acomodacao: round2(acomodacao),
    matricula: round2(matricula),
    material: round2(material),
    seguro: round2(seguro),
    totalMoeda,
  };
}

// Converte o total da moeda do curso para BRL pela VET (BRL por 1 unidade).
export function converterBRL(totalMoeda: number, vet: number): number {
  if (!(vet > 0)) return 0;
  return Math.round(totalMoeda * vet);
}

// ── Plano de pagamento PIX ────────────────────────────────────────────────
export type ParcelaPix = { rotulo: string; vencimento: string; valor: number };
export type PlanoPix = { parcelas: ParcelaPix[]; total: number; n: number };

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function ultimoDiaDoMes(iso: string): Date {
  const d = new Date(iso + "T00:00:00Z");
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
}
function somarDias(iso: string, dias: number): Date {
  const d = new Date(iso + "T00:00:00Z");
  return new Date(d.getTime() + dias * 86400000);
}
function diffMeses(a: Date, b: Date): number {
  return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
}
function addMeses(base: Date, n: number): Date {
  return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + n, base.getUTCDate()));
}

// Reparte um total em `parcelas` valores inteiros (BRL) que SOMAM o total: as
// primeiras recebem o piso e a ultima absorve o resto.
function repartir(total: number, parcelas: number): number[] {
  const base = Math.floor(total / parcelas);
  const out = Array(parcelas).fill(base);
  out[parcelas - 1] = total - base * (parcelas - 1);
  return out;
}

// Plano PIX: entrada (fim do mes corrente) + N parcelas mensais, a ultima 30
// dias antes do inicio. N = meses entre entrada e ultima, minimo 1; total de
// linhas = N+1. `numParcelasForcado` (opcional) permite o lead escolher o total
// de linhas (>=1); 1 = pagamento unico. Fallback: se a ultima data <= entrada,
// pagamento unico no fim do mes corrente.
export function planoPix(args: {
  totalBRL: number;
  dataInicioISO: string;
  hojeISO: string;
  numParcelasForcado?: number | null;
}): PlanoPix {
  const total = Math.round(args.totalBRL || 0);
  const entrada = ultimoDiaDoMes(args.hojeISO);
  const ultima = somarDias(args.dataInicioISO, -30);

  // Pagamento unico (forcado a 1, ou inicio muito proximo).
  const unico = args.numParcelasForcado === 1 || ultima.getTime() <= entrada.getTime();
  if (unico) {
    return { parcelas: [{ rotulo: "Entrada (pagamento único)", vencimento: ymd(entrada), valor: total }], total, n: 0 };
  }

  const nAuto = Math.max(1, diffMeses(entrada, ultima));
  const n = args.numParcelasForcado && args.numParcelasForcado > 1 ? args.numParcelasForcado - 1 : nAuto;
  const totalLinhas = n + 1;
  const valores = repartir(total, totalLinhas);

  const parcelas: ParcelaPix[] = [];
  parcelas.push({ rotulo: "Entrada", vencimento: ymd(entrada), valor: valores[0] });
  for (let k = 1; k <= n; k++) {
    const venc = k === n ? ultima : addMeses(entrada, k);
    parcelas.push({ rotulo: k === n ? `Parcela ${k} (final)` : `Parcela ${k}`, vencimento: ymd(venc), valor: valores[k] });
  }
  return { parcelas, total, n };
}

// ── Simulador por TRIMESTRE de saida (layout "Seu orcamento", spec-simulador) ──
// O lead escolhe QUANDO quer viajar (trimestre), nao uma data exata. O nº de
// parcelas (N) sai da distancia ate o FIM do trimestre, menos M meses de folga.

export type Trimestre = { key: string; label: string; fimISO: string };

// 6 trimestres a partir do PROXIMO trimestre apos hoje (o atual e curto demais).
export function trimestresDisponiveis(hojeISO: string, n = 6): Trimestre[] {
  const d = new Date(hojeISO + "T00:00:00Z");
  let y = d.getUTCFullYear();
  let q = Math.floor(d.getUTCMonth() / 3) + 2; // proximo trimestre
  while (q > 4) { q -= 4; y += 1; }
  const out: Trimestre[] = [];
  for (let i = 0; i < n; i++) {
    const fim = new Date(Date.UTC(y, q * 3, 0)); // ultimo dia do mes final do trimestre
    out.push({ key: `${y}-Q${q}`, label: `${q}º/${String(y).slice(2)}`, fimISO: fim.toISOString().slice(0, 10) });
    q += 1; if (q > 4) { q = 1; y += 1; }
  }
  return out;
}

// N = min(18, max(1, mesesAteOFimDoTrimestre - M)). M=2 (1 mes p/ pagar a escola
// no prazo do fornecedor + 1 mes p/ quitar antes do embarque). Base = FIM do
// trimestre (o rotulo e "ate N parcelas").
export function calcularNTrimestre(hojeISO: string, fimTrimestreISO: string, M = 2): number {
  const a = new Date(hojeISO + "T00:00:00Z");
  const b = new Date(fimTrimestreISO + "T00:00:00Z");
  const meses = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth()) + 1;
  return Math.min(18, Math.max(1, meses - M));
}

export type SimulacaoTrimestre = {
  n: number;
  entradaMoeda: number;
  financiadoMoeda: number; // total - entrada, na moeda do curso
  parcelaMoeda: number;
  parcelaBRL: number;
  entradaBRL: number;
  curto: boolean; // prazo curto (N <= 3): a vista ou poucas parcelas
  longo: boolean; // saida em 2028+: valor a confirmar
};

// Parcela = (total - entrada) / N, na moeda do curso, convertida pela VET.
// Entrada = taxas nao reembolsaveis (aqui: matricula/appFee).
export function simularParcelamento(args: {
  totalMoeda: number;
  entradaMoeda: number;
  vet: number;
  n: number;
  anoTrimestre?: number;
}): SimulacaoTrimestre {
  const entradaMoeda = Math.max(0, args.entradaMoeda);
  const financiadoMoeda = Math.max(0, args.totalMoeda - entradaMoeda);
  const parcelaMoeda = args.n > 0 ? financiadoMoeda / args.n : financiadoMoeda;
  return {
    n: args.n,
    entradaMoeda,
    financiadoMoeda: round2(financiadoMoeda),
    parcelaMoeda: round2(parcelaMoeda),
    parcelaBRL: args.vet > 0 ? Math.round(parcelaMoeda * args.vet) : 0,
    entradaBRL: args.vet > 0 ? Math.round(entradaMoeda * args.vet) : 0,
    curto: args.n <= 3,
    longo: (args.anoTrimestre ?? 0) >= 2028,
  };
}
