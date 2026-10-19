// Card de visto da cotacao: qual visto/autorizacao o brasileiro precisa para o
// programa apresentado, por pais de destino e duracao do curso.
//
// Fonte: pagina "RELATORIO: VISTOS E ENTRADAS DE BRASILEIROS NO EXTERIOR —
// 2025/2026" (Notion, referencia jun/2026), secao "Regime de visto" de cada
// pais. Regra de negocio, nao calculo: puro e testavel. Quando a regra mudar,
// atualize aqui e `VISTO_REFERENCIA`.

export const VISTO_REFERENCIA = "junho de 2026";

export type SituacaoVisto = "isento" | "autorizacao" | "visto";

/** Natureza do programa: o visto de estagio/voluntariado/trabalho nao e o de estudo. */
export type CategoriaPrograma = "estudo" | "estagio" | "voluntariado" | "trabalho";

export const CATEGORIA_ROTULO: Record<CategoriaPrograma, string> = {
  estudo: "Programa de estudo",
  estagio: "Programa de estágio",
  voluntariado: "Programa de voluntariado",
  trabalho: "Programa de trabalho",
};

/**
 * Classifica o programa pelo nome/tipo. Nao ha campo estruturado no catalogo
 * (estagio e voluntariado da Twin, por exemplo, sao produtos com esses termos
 * no nome); o que nao casa e estudo.
 */
export function categoriaDoPrograma(...textos: Array<string | null | undefined>): CategoriaPrograma {
  const t = textos.filter(Boolean).join(" ").toLowerCase();
  if (/volunt/.test(t)) return "voluntariado";
  if (/intern(ship)?\b|est[áa]gio|traineeship|work experience/.test(t)) return "estagio";
  if (/au[\s-]?pair|work\s*(and|&|e)\s*travel|working holiday|work\s*(and|&)\s*holiday/.test(t)) return "trabalho";
  return "estudo";
}

export type CartaoVisto = {
  categoria: CategoriaPrograma;
  /** Codigo ISO do pais de destino (alpha-2, maiusculo). */
  pais: string;
  /** Nome do pais em portugues. */
  paisNome: string;
  /** isento = sem visto; autorizacao = ETA/eTA; visto = visto/permissao consular. */
  situacao: SituacaoVisto;
  /** Resposta curta ao cliente: "Student Visa", "Isento de visto"... */
  titulo: string;
  /** Pontos de apoio (custo, prazo, exigencias). */
  detalhes: string[];
  /** Alertas (mudancas de regra, prazos longos). */
  alertas: string[];
};

type Faixa = { situacao: SituacaoVisto; titulo: string; detalhes: string[]; alertas?: string[] };

const NOMES: Record<string, string> = {
  US: "Estados Unidos",
  CA: "Canadá",
  GB: "Reino Unido",
  IE: "Irlanda",
  MT: "Malta",
  AU: "Austrália",
  NZ: "Nova Zelândia",
  AE: "Emirados Árabes Unidos",
  ES: "Espanha",
  FR: "França",
  DE: "Alemanha",
};

/** Dias de estadia sem visto (turismo) para os paises que isentam brasileiros. */
const DIAS_ISENCAO = 90;

function schengenIsento(extra: string[] = []): Faixa {
  return {
    situacao: "isento",
    titulo: "Sem visto: entrada como turista (até 90 dias)",
    detalhes: ["Brasileiros entram sem visto no Espaço Schengen por até 90 dias a cada 180.", ...extra],
  };
}

function schengenVistoD(titulo: string, extra: string[] = []): Faixa {
  return {
    situacao: "visto",
    titulo,
    detalhes: ["Estadia acima de 90 dias exige visto de longa duração, pedido nos consulados no Brasil.", ...extra],
  };
}

/** Escolhe a faixa de visto pelo pais e pelos dias de curso (null = duracao desconhecida). */
function faixaDoPais(pais: string, dias: number | null): Faixa | null {
  const longo = dias !== null && dias > DIAS_ISENCAO;
  switch (pais) {
    case "US":
      return {
        situacao: "visto",
        titulo: "Visto F-1 (estudante)",
        detalhes: [
          "Visto obrigatório para estudar nos EUA: F-1 ou M-1 para cursos acadêmicos e vocacionais.",
          "Emitido nos consulados do Brasil (São Paulo, Rio de Janeiro, Recife, Brasília e Porto Alegre).",
        ],
        alertas: ["O tempo de espera por entrevista nos consulados do Brasil aumentou muito em 2025–2026. Peça o visto com bastante antecedência."],
      };
    case "CA":
      return {
        situacao: "visto",
        titulo: "Visto TRV + Study Permit",
        detalhes: [
          "Brasileiros precisam de visto de residente temporário (TRV) e, para estudar, de study permit.",
          "TRV: CAD 100 + biometria CAD 85. A eTA (CAD 7) só vale para quem tem visto americano válido ou visto canadense emitido nos últimos 10 anos.",
        ],
        alertas: ["O Student Direct Stream (processamento rápido) acabou em 8/11/2024: o pedido segue o fluxo padrão, mais longo."],
      };
    case "GB":
      if (dias === null) {
        return {
          situacao: "autorizacao",
          titulo: "ETA ou Student Visa (conforme a duração)",
          detalhes: ["Cursos de até 6 meses: ETA (£16, válida por 2 anos). Acima de 6 meses: Student Visa (cerca de £524)."],
        };
      }
      if (dias <= 183) {
        return {
          situacao: "autorizacao",
          titulo: "ETA (autorização eletrônica)",
          detalhes: ["Obrigatória para brasileiros desde 8/1/2025, inclusive para cursos de até 6 meses.", "Custo £16, validade de 2 anos com múltiplas entradas, pedido 100% digital."],
        };
      }
      return {
        situacao: "visto",
        titulo: "Student Visa",
        detalhes: [
          "Cursos acima de 6 meses exigem Student Visa (cerca de £524), pedido pela VFS Global no Brasil.",
          "Para cursos de inglês de 7 a 11 meses existe também o Short-term Study Visa.",
        ],
      };
    case "IE":
      return longo
        ? {
            situacao: "visto",
            titulo: "Visto de estudante",
            detalhes: [
              "Brasileiros não precisam de visto para visitas de até 90 dias. Cursos com matrícula formal exigem visto de estudante.",
              "Comprovação financeira mínima: € 10.000 por ano de estudo (regra 2026).",
            ],
          }
        : {
            situacao: "isento",
            titulo: "Sem visto: entrada como turista (até 90 dias)",
            detalhes: ["Brasileiros entram na Irlanda sem visto para visitas de até 90 dias.", "Cursos com matrícula formal exigem visto de estudante."],
          };
    case "MT":
      return longo
        ? schengenVistoD("Visto Nacional Tipo D", ["Autoridade central: Identità (Central Visa Unit).", "Estudantes internacionais podem trabalhar legalmente após 90 dias contínuos de estadia (regra 2025)."])
        : schengenIsento(["Para estudar mais de 90 dias é preciso o Visto Nacional Tipo D."]);
    case "ES":
      return longo
        ? schengenVistoD("Visto Nacional Tipo D", ["Comprovação mínima de € 600 por mês (IPREM 2025).", "O processamento costuma levar de 8 a 12 semanas."])
        : schengenIsento(["Para estudar mais de 90 dias é preciso o Visto Nacional Tipo D."]);
    case "FR":
      return longo
        ? schengenVistoD("Visto de Longa Duração (VLS) / Nacional D", ["A candidatura passa pelo portal Campus France.", "Exige comprovação financeira rigorosa."])
        : schengenIsento(["Para estudar mais de 90 dias é preciso o Visto de Longa Duração (VLS)."]);
    case "DE":
      return longo
        ? schengenVistoD("Visto Nacional Tipo D")
        : schengenIsento(["Para estudar mais de 90 dias é preciso o Visto Nacional Tipo D."]);
    case "AU":
      return {
        situacao: "visto",
        titulo: "Student Visa (subclass 500)",
        detalhes: [
          "Visto obrigatório para todas as categorias; para estudos formais é o Student Visa (subclass 500).",
          "Exige o requisito Genuine Student, que substituiu o antigo GTE em 23/3/2024. O pedido é online, pelo ImmiAccount.",
        ],
      };
    case "NZ":
      return {
        situacao: "visto",
        titulo: "Student Visa",
        detalhes: ["Brasileiros não são isentos: cursos formais exigem Student Visa.", "O pedido é online, pelo site da Immigration New Zealand."],
      };
    case "AE":
      return longo
        ? { situacao: "visto", titulo: "Visto de estudante", detalhes: ["Estudo formal exige visto. A isenção vale só para visitas de até 90 dias."] }
        : { situacao: "isento", titulo: "Sem visto: entrada como turista (até 90 dias)", detalhes: ["Brasileiros entram nos Emirados sem visto desde 2018, por até 90 dias.", "Estudo formal exige visto."] };
    default:
      return null;
  }
}

const AVISO_ENQUADRAMENTO =
  "O enquadramento exato (e o patrocinador do visto) é definido pela organização do programa — o consultor confirma antes da contratação.";

/**
 * Estagio, voluntariado e trabalho NUNCA caem na isencao de turista nem no
 * visto de estudante: exigem permissao propria. Os tipos abaixo sao o
 * enquadramento usual por pais; confirmar por programa.
 */
function faixaNaoEstudo(pais: string, cat: Exclude<CategoriaPrograma, "estudo">): Faixa | null {
  const t: Record<string, Partial<Record<Exclude<CategoriaPrograma, "estudo">, [string, string[]]>>> = {
    US: {
      estagio: ["Visto J-1 (Intern/Trainee)", ["Exige patrocínio de uma organização designada pelo governo americano e o formulário DS-2019."]],
      voluntariado: ["Visto J-1 ou B-1 (conforme o programa)", ["O tipo depende de a atividade ser patrocinada por organização designada."]],
      trabalho: ["Visto J-1 (Exchange Visitor)", ["Work & Travel, Au Pair e similares são patrocinados por organizações designadas."]],
    },
    CA: {
      estagio: ["Work Permit (permissão de trabalho)", ["Estágio no Canadá exige permissão de trabalho; o tipo (ex.: co-op ou específico do empregador) depende do programa."]],
      voluntariado: ["Visto de visitante (TRV), voluntariado não remunerado", ["Vale para voluntariado curto e sem remuneração; atividades longas podem exigir permissão de trabalho."]],
      trabalho: ["Work Permit (permissão de trabalho)", ["O tipo depende do programa e do empregador."]],
    },
    GB: {
      estagio: ["Temporary Worker – Government Authorised Exchange", ["Exige certificado de patrocínio (CoS) de organização autorizada. Estágio não cabe na ETA nem no Student Visa."]],
      voluntariado: ["Standard Visitor ou Temporary Worker – Charity Worker", ["Voluntariado curto para instituição de caridade cabe como visitante; atividades mais longas pedem visto de trabalho temporário."]],
      trabalho: ["Visto de trabalho temporário (Temporary Worker)", ["O Youth Mobility Scheme não está disponível para brasileiros; o tipo depende do patrocinador."]],
    },
    IE: {
      estagio: ["Autorização de estágio/trabalho (Employment Permit ou Stamp 1)", ["A isenção de visto de turista não permite estagiar. A permissão é pedida pela organização e/ou pelo aluno."]],
      voluntariado: ["Visto/autorização de voluntariado (conforme duração)", ["Voluntariado curto e não remunerado costuma caber como visita; períodos longos exigem autorização própria."]],
      trabalho: ["Employment Permit (permissão de trabalho)", ["O tipo depende do programa e do empregador."]],
    },
    MT: {
      estagio: ["Autorização de estágio/trabalho (Single Permit) + Visto D", ["A isenção Schengen de turista (90 dias) não cobre estágio. O visto D é pedido nos consulados após aprovação da autorização."]],
      voluntariado: ["Visto Nacional Tipo D (voluntariado) ou entrada como turista (curto)", ["Voluntariado de até 90 dias e sem remuneração pode caber como visita; acima disso exige visto D."]],
      trabalho: ["Single Permit (autorização de trabalho) + Visto D", ["O empregador patrocina a autorização."]],
    },
    ES: {
      estagio: ["Visto de estudos/prácticas (Visado Nacional D)", ["Estágio na Espanha exige autorização própria; a isenção Schengen de turista não cobre a atividade."]],
      voluntariado: ["Visto Nacional Tipo D (voluntariado)", ["Atividades de voluntariado estruturado exigem visto nacional."]],
      trabalho: ["Visto de trabalho (Visado Nacional D)", ["Exige oferta e autorização de trabalho do empregador."]],
    },
    FR: {
      estagio: ["Visto de Longa Duração (VLS) – estágio (stage)", ["Exige convenção de estágio com instituição de ensino ou empregador."]],
      voluntariado: ["Visto de Longa Duração (VLS) – voluntariado", ["Exige organização acolhedora cadastrada."]],
      trabalho: ["Visto de trabalho (VLS-T)", ["Exige autorização de trabalho do empregador."]],
    },
    DE: {
      estagio: ["Visto Nacional Tipo D – estágio (Praktikum)", ["Exige contrato de estágio e, em geral, autorização da agência federal de emprego."]],
      voluntariado: ["Visto Nacional Tipo D – voluntariado", ["Exige organização acolhedora reconhecida."]],
      trabalho: ["Visto de trabalho (Visto Nacional Tipo D)", ["Exige autorização de trabalho do empregador."]],
    },
    AU: {
      estagio: ["Training Visa (subclass 407)", ["O estágio é patrocinado por organização aprovada. Alternativa: Work and Holiday (subclass 462), com cota de 500 vagas/ano para brasileiros."]],
      voluntariado: ["Visitor Visa (subclass 600) ou Work and Holiday (subclass 462)", ["Voluntariado curto e não remunerado pode caber no Visitor; a cota do 462 é de 500 vagas/ano para brasileiros."]],
      trabalho: ["Work and Holiday Visa (subclass 462)", ["Cota de 500 vagas por ano para brasileiros de 18 a 30 anos."]],
    },
    NZ: {
      estagio: ["Work Visa (visto de trabalho)", ["Estágio exige permissão de trabalho; o tipo depende do programa."]],
      voluntariado: ["Visitor Visa (voluntariado) ou Work Visa", ["Voluntariado curto e não remunerado pode caber no visto de visitante."]],
      trabalho: ["Working Holiday Visa (acordo Brasil–NZ)", ["A cota foi esgotada em 2025; reabertura prevista para 2026."]],
    },
  };
  const hit = t[pais]?.[cat];
  const detalhes = hit ? hit[1] : ["Estágio, voluntariado e trabalho exigem permissão própria, diferente do visto de estudo."];
  const titulo = hit ? hit[0] : "Visto específico do programa (não é o visto de estudante)";
  return { situacao: "visto", titulo, detalhes, alertas: [AVISO_ENQUADRAMENTO] };
}

function diasEntre(inicio: string | null, fim: string | null): number | null {
  if (!inicio || !fim) return null;
  const a = Date.parse(`${inicio}T00:00:00Z`);
  const b = Date.parse(`${fim}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return Math.round((b - a) / 86_400_000) + 1;
}

/**
 * Card de visto do programa. `pais` e o codigo do campus; `inicio`/`fim` as
 * datas do curso (AAAA-MM-DD) e `semanas` a quantidade vendida, usada quando
 * faltam datas. Retorna null para pais fora da tabela: sem regra conhecida o
 * card nao aparece (nunca "adivinha" o visto).
 */
export function resolverVisto(args: {
  categoria?: CategoriaPrograma;
  pais: string | null | undefined;
  inicio?: string | null;
  fim?: string | null;
  semanas?: number | null;
}): CartaoVisto | null {
  let pais = (args.pais ?? "").trim().toUpperCase();
  if (pais === "UK") pais = "GB";
  if (!NOMES[pais]) return null;
  let dias = diasEntre(args.inicio ?? null, args.fim ?? null);
  if (dias === null && typeof args.semanas === "number" && Number.isFinite(args.semanas) && args.semanas > 0) {
    dias = Math.round(args.semanas * 7);
  }
  const categoria = args.categoria ?? "estudo";
  const f = categoria === "estudo" ? faixaDoPais(pais, dias) : faixaNaoEstudo(pais, categoria);
  if (!f) return null;
  return { categoria, pais, paisNome: NOMES[pais], situacao: f.situacao, titulo: f.titulo, detalhes: f.detalhes, alertas: f.alertas ?? [] };
}
