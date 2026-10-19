// Card de visto da cotacao: qual visto/autorizacao o brasileiro precisa para o
// programa apresentado, por pais de destino, natureza do programa e duracao.
//
// Fonte: levantamento de out/2026 em sites OFICIAIS de governo (gov.uk,
// canada.ca/IRCC, immigration.govt.nz, homeaffairs.gov.au, j1visa.state.gov,
// identita.gov.mt, auswaertiges-amt.de...), com o Mundo dos Vistos so como apoio.
// Onde o governo bloqueou a leitura ou a regra nao foi confirmada, o card DIZ
// que e a confirmar — nunca afirma um tipo de visto sem fonte.
//
// Registro completo (fontes, divergencias, lacunas): pagina do Notion
// "RELATORIO: VISTOS E ENTRADAS DE BRASILEIROS NO EXTERIOR". Quem monitora as
// mudancas: agente `monitor-vistos`. Ao mudar uma regra aqui, atualize os dois.
//
// Regra de negocio, nao calculo: puro e testavel.

export const VISTO_REFERENCIA = "outubro de 2026";

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
  /** Resposta curta ao cliente: o TIPO de visto ("Student Visa", "Visto J-1"...). */
  titulo: string;
  /** Pontos de apoio (custo, prazo, exigencias). */
  detalhes: string[];
  /** Alertas (mudancas de regra, regra a confirmar). */
  alertas: string[];
  /** Pagina oficial (https) onde a regra foi lida; null quando nao ha. */
  fonte: string | null;
};

type Faixa = { situacao: SituacaoVisto; titulo: string; detalhes: string[]; alertas?: string[]; fonte?: string };

/**
 * Paises com programa CADASTRADO no catalogo (consulta de 19/10/2026: CA, GB,
 * IE, MT, NZ, US). Pais fora desta lista nao gera card. Ao cadastrar um destino
 * novo, acrescente aqui e as regras abaixo; o agente `monitor-vistos` reconfere o
 * escopo no catalogo a cada rodada.
 */
const NOMES: Record<string, string> = {
  US: "Estados Unidos",
  CA: "Canadá",
  GB: "Reino Unido",
  IE: "Irlanda",
  MT: "Malta",
  NZ: "Nova Zelândia",
};

const A_CONFIRMAR = "Esta regra ainda não foi confirmada em fonte oficial: o consultor confirma o tipo de visto antes da contratação.";
const ENQUADRAMENTO = "O enquadramento exato (e o patrocinador do visto) é definido pela organização do programa — o consultor confirma antes da contratação.";

/** Faixa para o que a pesquisa nao confirmou: diz isso, em vez de chutar um visto. */
function aConfirmar(cat: Exclude<CategoriaPrograma, "estudo">, extra: string[] = []): Faixa {
  const nome = cat === "estagio" ? "estágio" : cat === "voluntariado" ? "voluntariado" : "trabalho";
  return {
    situacao: "visto",
    titulo: `Visto de ${nome} — tipo a confirmar`,
    detalhes: [`${nome[0].toUpperCase()}${nome.slice(1)} exige permissão própria, diferente do visto de estudo e da entrada como turista.`, ...extra],
    alertas: [A_CONFIRMAR],
  };
}

// --- Estudo ----------------------------------------------------------------

const DIAS_6_MESES = 183;
const DIAS_90 = 90;

function schengenEstudo(longo: boolean, dias: number | null, longoTitulo: string, extraLongo: string[], extraCurto: string[] = [], fonte?: string): Faixa {
  if (!longo || dias === null) {
    return {
      situacao: "isento",
      titulo: "Sem visto: entrada como turista (até 90 dias)",
      detalhes: ["Brasileiros entram no Espaço Schengen sem visto por até 90 dias a cada 180.", ...extraCurto],
      alertas: ["Para estudar mais de 90 dias é preciso visto de longa duração. Se o consultor indicar estudo formal, confirme se a isenção se aplica ao seu curso."],
      fonte,
    };
  }
  return { situacao: "visto", titulo: longoTitulo, detalhes: ["Estadia acima de 90 dias exige visto de longa duração, pedido nos consulados no Brasil.", ...extraLongo], fonte };
}

function estudo(pais: string, dias: number | null): Faixa | null {
  const longo = dias !== null && dias > DIAS_90;
  switch (pais) {
    case "US":
      return {
        situacao: "visto",
        titulo: "Visto F-1 (estudante)",
        detalhes: [
          "Curso acadêmico ou de idioma em escola certificada exige F-1 (M-1 para cursos vocacionais), com o formulário I-20 da escola.",
          "Taxa SEVIS I-901 de US$ 350, paga antes da entrada.",
          "Curso recreativo curto, sem créditos nem certificado, pode ser feito como turista (B-2).",
        ],
        alertas: [
          "O tempo de espera por entrevista nos consulados do Brasil é longo: peça o visto com antecedência.",
          "Algumas escolas indicam que cursos semi-intensivos podem ser feitos como turista (B-2). O governo restringe o B-2 a estudo recreativo sem créditos: o consultor confirma o enquadramento do seu curso.",
        ],
        fonte: "https://studyinthestates.dhs.gov/students/prepare/students-and-the-form-i-20",
      };
    case "CA":
      if (dias !== null && dias <= DIAS_6_MESES) {
        return {
          situacao: "visto",
          titulo: "Sem study permit: TRV (visto de visitante) ou eTA",
          detalhes: [
            "Curso que não faz parte de programa mais longo e termina dentro do prazo de estadia (normalmente 6 meses) dispensa o study permit.",
            "TRV: CAD 100 + biometria CAD 85. A eTA (CAD 7, só viagem aérea) vale apenas para quem teve TRV nos últimos 10 anos ou tem visto americano válido.",
          ],
          alertas: ["Em Quebec o curso também exige o CAQ."],
          fonte: "https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada/study-permit/study-permit-tool.html",
        };
      }
      return {
        situacao: "visto",
        titulo: "Study Permit (permissão de estudo) + TRV ou eTA",
        detalhes: [
          "Cursos acima de 6 meses exigem study permit: carta de aceite da escola, comprovação de fundos e, na maioria dos casos, atestado provincial (PAL/TAL).",
          "Taxa do study permit: CAD 150. O IRCC emite também o TRV ou a eTA para a entrada.",
        ],
        alertas: ["O processamento rápido (Student Direct Stream) acabou em 8/11/2024: o pedido segue o fluxo padrão."],
        fonte: "https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada/study-permit/get-documents.html",
      };
    case "GB":
      if (dias === null) {
        return {
          situacao: "autorizacao",
          titulo: "ETA (até 6 meses) ou Student Visa (acima disso)",
          detalhes: ["Estudo de até 6 meses cabe na ETA (£ 20). Acima disso: Short-term study visa (inglês, 7 a 11 meses) ou Student Visa."],
          fonte: "https://www.gov.uk/standard-visitor/visit-to-study",
        };
      }
      if (dias <= DIAS_6_MESES) {
        return {
          situacao: "autorizacao",
          titulo: "ETA (autorização eletrônica) — Standard Visitor",
          detalhes: [
            "Estudo de até 6 meses em instituição credenciada, inclusive curso de inglês, cabe na ETA (£ 20). Não vale para academies nem escolas estatais.",
            "A ETA é obrigatória para brasileiros desde 8/1/2025 e dispensa o visto tradicional.",
          ],
          fonte: "https://www.gov.uk/standard-visitor/permitted-activities",
        };
      }
      if (dias <= 335) {
        return {
          situacao: "visto",
          titulo: "Short-term study visa (inglês) ou Student Visa",
          detalhes: [
            "Curso de inglês de 6 a 11 meses: Short-term study visa (£ 228 + taxa de saúde), sem direito a trabalhar nem estender.",
            "Qualquer outro curso acima de 6 meses: Student Visa (£ 558 + taxa de saúde), com escola licenciada e comprovação de recursos.",
          ],
          fonte: "https://www.gov.uk/study-visit-visa/what-you-can-and-cannot-do",
        };
      }
      return {
        situacao: "visto",
        titulo: "Student Visa",
        detalhes: ["Exige escola licenciada como patrocinadora e prova de recursos. Taxa de £ 558 fora do Reino Unido + taxa de saúde."],
        fonte: "https://www.gov.uk/student-visa",
      };
    case "IE":
      if (!longo) {
        return {
          situacao: "isento",
          titulo: "Sem visto de entrada (permissão concedida na chegada)",
          detalhes: ["Brasileiros não precisam de visto de entrada na Irlanda. A permissão é dada pela imigração na chegada, mediante as condições de entrada."],
          alertas: ["Alguns cursos exigem registro de residência a partir de 12 semanas; o consultor confirma o limite do seu curso."],
          fonte: "https://www.ireland.ie/en/brazil/saopaulo/services/new-to-brazil/",
        };
      }
      return {
        situacao: "autorizacao",
        titulo: "Registro de imigração (IRP) — Stamp 2",
        detalhes: [
          "Acima de 90 dias o aluno se registra na imigração irlandesa após a chegada e recebe o Stamp 2 (taxa de cerca de € 300).",
          "Curso de inglês precisa constar na lista oficial ILEP: mínimo de 25 semanas e 15 horas semanais.",
        ],
        alertas: ["Dados lidos de resultados de busca em sites do governo: o consultor confirma antes da contratação."],
        fonte: "https://www.irishimmigration.ie/coming-to-study-in-ireland/what-are-my-study-options/a-third-level-course-or-a-language-course/",
      };
    case "MT":
      return schengenEstudo(longo, dias, "National Long Stay Visa (D-Visa) — estudante", [
        "Pedido por prestador externo autorizado, com agendamento no sistema de vistos da Identità.",
        "Cursos acima de 90 dias corridos exigem o D-Visa mesmo para quem tem isenção de turista.",
      ], [], "https://identita.gov.mt/central-visa-unit-student-visa-courses-exceeding-90-days/");
    case "NZ":
      if (dias !== null && dias <= 92) {
        return {
          situacao: "autorizacao",
          titulo: "NZeTA (autorização eletrônica) ou Visitor Visa",
          detalhes: [
            "Brasileiros são isentos de visto: estudo de até 3 meses (inclusive inglês) cabe na NZeTA (a partir de NZD 17) ou no Visitor Visa (a partir de NZD 441).",
          ],
          fonte: "https://www.immigration.govt.nz/visit/what-you-need-to-visit-new-zealand/visa-waiver-countries-and-territories/",
        };
      }
      return {
        situacao: "visto",
        titulo: "Fee Paying Student Visa",
        detalhes: [
          "Estudo acima de 3 meses exige oferta de vaga de escola signatária do Code of Practice. Taxa a partir de NZD 850.",
          "Fundos de NZD 1.667 por mês (cursos de menos de 1 ano) ou NZD 20.000 por ano.",
        ],
        fonte: "https://www.immigration.govt.nz/visas/fee-paying-student-visa/",
      };
    default:
      return null;
  }
}

// --- Estagio, voluntariado e trabalho ---------------------------------------

type NaoEstudo = Exclude<CategoriaPrograma, "estudo">;

function naoEstudo(pais: string, cat: NaoEstudo, dias: number | null): Faixa {
  switch (`${pais}:${cat}`) {
    case "US:estagio":
      return {
        situacao: "visto",
        titulo: "Visto F-1 do curso de inglês combinado (estágio voluntário, sem remuneração)",
        detalhes: [
          "Segundo a escola (Rennert), o estágio é combinado com um curso de inglês elegível ao F-1: mínimo de 22 aulas por semana pela manhã e atividade à tarde ou no fim de semana a partir da 2ª semana.",
          "A atividade é não remunerada e o certificado é de voluntariado. A escola emite o I-20; taxa SEVIS I-901 de US$ 350.",
        ],
        alertas: [
          "A escola não cita J-1 nem CPT. Estágio remunerado nos EUA exigiria o J-1 (Intern/Trainee), com patrocinador designado. O consultor confirma o enquadramento antes da contratação.",
        ],
        fonte: "https://rennert.com/business-english-courses/business-english-in-action.html",
      };
    case "GB:estagio":
      return {
        situacao: "visto",
        titulo: "Government Authorised Exchange (Temporary Work)",
        detalhes: [
          "Work experience e treinamento dentro de esquema aprovado, com patrocinador licenciado. Máximo de 12 ou 24 meses conforme o esquema.",
          "A Twin informa que candidatos de fora do Espaço Econômico Europeu participam por parceria com a BUNAC, patrocinadora do visto (nome antigo: Tier 5). Estágio de até 6 meses, mínimo de 25 horas por semana.",
          "Custo do certificado de patrocínio da BUNAC: £ 2.500.",
          "Taxa do visto de £ 340 + taxa de saúde. Exige £ 1.270 em conta por 28 dias, salvo exceção.",
        ],
        alertas: [
          "A ETA e o visto de visitante não permitem estagiar. A página do programa não cita o visto: o consultor confirma com a Twin a rota para brasileiros. " + ENQUADRAMENTO,
        ],
        fonte: "https://www.gov.uk/government-authorised-exchange",
      };
    case "GB:voluntariado": {
      const longo = dias !== null && dias > 30;
      if (longo) {
        return {
          situacao: "visto",
          titulo: "Temporary Worker – Charity Worker (voluntariado acima de 30 dias)",
          detalhes: [
            "A ETA (Standard Visitor) só cobre voluntariado de até 30 dias em instituição de caridade registrada. Acima disso, o governo prevê o visto Charity Worker, para trabalho voluntário não remunerado.",
            "Exige certificate of sponsorship emitido por organização licenciada, e o trabalho deve ser da própria organização patrocinadora. Taxa de £ 340 + taxa de saúde (cerca de £ 1.035 por ano) e comprovação de recursos.",
          ],
          alertas: [
            "O programa passa de 30 dias: o consultor confirma com a Twin quem patrocina o visto, ou se o voluntariado será limitado a 30 dias para caber na ETA.",
          ],
          fonte: "https://www.gov.uk/temporary-worker-charity-worker-visa",
        };
      }
      return {
        situacao: "autorizacao",
        titulo: "ETA — Standard Visitor (voluntariado de até 30 dias)",
        detalhes: [
          "Voluntariado de até 30 dias com instituição de caridade registrada cabe como visitante (ETA de £ 20). A Twin informa a mesma regra.",
        ],
        alertas: ["O voluntariado precisa ser em instituição de caridade registrada (não em empresa). Se passar de 30 dias, é preciso outro visto: confirme com o consultor."],
        fonte: "https://www.gov.uk/standard-visitor/volunteering",
      };
    }
    case "IE:estagio":
      return {
        situacao: "visto",
        titulo: "Employment Permit (modalidade de estágio) — a confirmar",
        detalhes: [
          "A isenção de visto de entrada não permite estagiar. Estágio exige permissão de trabalho pedida pelo empregador.",
          "O site da escola (Twin) não informa o visto para este estágio.",
        ],
        alertas: [A_CONFIRMAR],
        fonte: "https://www.citizensinformation.ie/en/moving-country/working-in-ireland/employment-permits/overview-employment-permits/",
      };
    default:
      return aConfirmar(cat);
  }
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
  const f = categoria === "estudo" ? estudo(pais, dias) : naoEstudo(pais, categoria, dias);
  if (!f) return null;
  const fonte = f.fonte && /^https:\/\//.test(f.fonte) ? f.fonte : null;
  return { categoria, pais, paisNome: NOMES[pais], situacao: f.situacao, titulo: f.titulo, detalhes: f.detalhes, alertas: f.alertas ?? [], fonte };
}
