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
        alertas: ["O tempo de espera por entrevista nos consulados do Brasil é longo: peça o visto com antecedência."],
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
    case "ES":
      return schengenEstudo(longo, dias, "Visado de estudios (visto nacional de estudante)", [
        "Pedido com no mínimo 2 meses de antecedência. Acima de 6 meses o visto é emitido com validade de 365 dias.",
      ], ["O consulado da Espanha lista o visado de estancia para estudos; confirme se o seu curso dispensa."]);
    case "FR":
      return schengenEstudo(longo, dias, "VLS-TS «étudiant» (visto de longa duração de estudante)", [
        "Estudo acima de 3 meses exige o VLS-TS, validado em até 3 meses após a chegada. Taxa de € 99 (€ 50 com Campus France, conforme o país).",
      ], [], "https://www.france-visas.gouv.fr/en/etudiant");
    case "DE":
      return schengenEstudo(longo, dias, "Nationales Visum (visto nacional D) — estudo", [
        "Taxa de € 75. Curso de idioma intensivo exige no mínimo 18 horas por semana.",
        "Comprovação financeira de cerca de € 1.091 por mês (conta bloqueada ou declaração de compromisso).",
      ], [], "https://www.auswaertiges-amt.de/en/visa-service/215870-215870");
    case "AU":
      if (dias !== null && dias <= 84) {
        return {
          situacao: "visto",
          titulo: "Visitor visa (subclass 600) — estudo curto",
          detalhes: ["Estudo ou treinamento de até 3 meses é permitido no visto de visitante. Trabalho não é permitido."],
          alertas: ["Quando o estudo é o motivo principal da viagem, o governo indica que o Student visa pode ser mais adequado: o consultor confirma o seu caso."],
          fonte: "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/visitor-600",
        };
      }
      return {
        situacao: "visto",
        titulo: "Student visa (subclass 500)",
        detalhes: [
          "Exige o Confirmation of Enrolment (CoE) da escola, seguro saúde OSHC e o requisito Genuine Student.",
        ],
        alertas: ["Desde 2/10/2026, quem não é isento deve pedir o visto de fora da Austrália e estar fora do país quando ele for concedido."],
        fonte: "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/changes-to-student-visa-application-rules-500-590",
      };
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
    case "AE":
      return longo
        ? { situacao: "visto", titulo: "Visto de estudante — tipo a confirmar", detalhes: ["A isenção de 90 dias vale para visitas; estudo formal exige visto."], alertas: [A_CONFIRMAR] }
        : {
            situacao: "isento",
            titulo: "Sem visto: entrada como turista (até 90 dias)",
            detalhes: ["Brasileiros entram nos Emirados sem visto por até 90 dias em 12 meses, com passaporte válido por 6 meses ou mais e passagem de saída."],
            alertas: ["Se o curso for estudo formal, o consultor confirma se a isenção se aplica."],
            fonte: "https://www.mofa.gov.ae/en/missions/brasilia/contact-us/faqs",
          };
    default:
      return null;
  }
}

// --- Estagio, voluntariado e trabalho ---------------------------------------

type NaoEstudo = Exclude<CategoriaPrograma, "estudo">;

function naoEstudo(pais: string, cat: NaoEstudo): Faixa {
  switch (`${pais}:${cat}`) {
    case "US:estagio":
      return {
        situacao: "visto",
        titulo: "Visto J-1 (Intern ou Trainee)",
        detalhes: [
          "Intern: aluno de curso pós-secundário ou formado há até 12 meses; duração máxima de 12 meses.",
          "Trainee: diploma e 1 ano de experiência (ou 5 anos de experiência); máximo de 18 meses.",
          "Exige patrocinador designado pelo governo e o formulário DS-7002.",
        ],
        alertas: [ENQUADRAMENTO],
        fonte: "https://j1visa.state.gov/programs/intern/",
      };
    case "US:trabalho":
      return {
        situacao: "visto",
        titulo: "Visto J-1 (Summer Work Travel ou Au Pair)",
        detalhes: [
          "Summer Work Travel: universitário em tempo integral, até 4 meses, só por patrocinador.",
          "Au Pair: 18 a 26 anos, 12 meses (prorrogável), patrocinador obrigatório.",
        ],
        alertas: [ENQUADRAMENTO],
        fonte: "https://j1visa.state.gov/programs/summer-work-travel/",
      };
    case "CA:estagio":
      return {
        situacao: "visto",
        titulo: "Work Permit (estágio conta como trabalho)",
        detalhes: [
          "O IRCC considera trabalho também a atividade não remunerada que seria experiência valiosa a um canadense. Taxa do work permit: CAD 155.",
          "Aluno com study permit pode estagiar dentro do programa sem co-op permit (regra de 1/4/2026 para pós-secundário).",
        ],
        alertas: ["O Brasil não participa do IEC (Working Holiday/Co-op). Estágio avulso: o consultor confirma o tipo de permissão."],
        fonte: "https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada/work/intern.html",
      };
    case "CA:voluntariado":
      return {
        situacao: "visto",
        titulo: "Visitante (TRV/eTA) para voluntariado curto e não remunerado",
        detalhes: [
          "Voluntariado normalmente não remunerado, em tempo parcial e incidental ao motivo da viagem não é considerado trabalho.",
          "Projeto de voluntariado em tempo integral pode exigir work permit.",
        ],
        alertas: [A_CONFIRMAR],
      };
    case "CA:trabalho":
      return {
        situacao: "visto",
        titulo: "Work Permit (com oferta de emprego)",
        detalhes: ["Taxa de CAD 155. Visto ou eTA de visitante não permite trabalhar."],
        alertas: ["O Brasil não está na lista de países do IEC (Working Holiday). " + ENQUADRAMENTO],
        fonte: "https://www.canada.ca/en/immigration-refugees-citizenship/services/work-canada/iec/eligibility.html",
      };
    case "GB:estagio":
      return {
        situacao: "visto",
        titulo: "Government Authorised Exchange (Temporary Work)",
        detalhes: [
          "Work experience e treinamento dentro de esquema aprovado, com patrocinador licenciado. Máximo de 12 ou 24 meses conforme o esquema.",
          "Taxa de £ 340 + taxa de saúde. Exige £ 1.270 em conta por 28 dias, salvo exceção.",
        ],
        alertas: ["Estágio pago por empresa fora de um esquema aprovado: a confirmar. " + ENQUADRAMENTO],
        fonte: "https://www.gov.uk/government-authorised-exchange",
      };
    case "GB:voluntariado":
      return {
        situacao: "autorizacao",
        titulo: "ETA — Standard Visitor (voluntariado de até 30 dias)",
        detalhes: ["Voluntariado de até 30 dias com instituição de caridade registrada cabe como visitante (ETA de £ 20)."],
        alertas: ["Voluntariado mais longo ou fora de caridade registrada exige outro visto: a confirmar com o consultor."],
        fonte: "https://www.gov.uk/standard-visitor/volunteering",
      };
    case "GB:trabalho":
      return {
        situacao: "visto",
        titulo: "Visto de trabalho com patrocinador (ex.: Skilled Worker)",
        detalhes: ["O Youth Mobility Scheme não está disponível para brasileiros."],
        alertas: [ENQUADRAMENTO],
        fonte: "https://www.gov.uk/youth-mobility/eligibility",
      };
    case "IE:estagio":
      return {
        situacao: "visto",
        titulo: "Employment Permit (modalidade de estágio) — a confirmar",
        detalhes: ["A isenção de visto de entrada não permite estagiar. Estágio exige permissão de trabalho pedida pelo empregador."],
        alertas: [A_CONFIRMAR],
        fonte: "https://www.citizensinformation.ie/en/moving-country/working-in-ireland/employment-permits/overview-employment-permits/",
      };
    case "IE:trabalho":
      return {
        situacao: "visto",
        titulo: "Employment Permit (Stamp 1)",
        detalhes: ["Trabalho na Irlanda exige permissão de trabalho patrocinada pelo empregador."],
        alertas: [A_CONFIRMAR],
        fonte: "https://www.citizensinformation.ie/en/moving-country/working-in-ireland/employment-permits/overview-employment-permits/",
      };
    case "ES:estagio":
      return {
        situacao: "visto",
        titulo: "Prácticas não laborais — visado de estancia (curta) ou de prácticas (longa)",
        detalhes: ["Exige convênio assinado com empresa ou centro de formação reconhecido e seguro de responsabilidade civil da organização."],
        alertas: [A_CONFIRMAR],
        fonte: "https://www.exteriores.gob.es/Consulados/nador/es/Consulado/Documents/Visados/VIS/4.pdf",
      };
    case "ES:voluntariado":
      return {
        situacao: "visto",
        titulo: "Visado de estancia com voluntariado",
        detalhes: ["Exige convênio com a organização do programa, descrição das atividades e horário, meios de viagem, manutenção e alojamento."],
        alertas: [A_CONFIRMAR],
      };
    case "DE:estagio":
      return {
        situacao: "visto",
        titulo: "Visto nacional de estágio (Praktikum)",
        detalhes: [
          "O visto já inclui a autorização de trabalho. Processo de até 12 semanas; taxa de € 75.",
          "Estágio em empresa: mínimo de € 1.200 brutos (ou € 941 líquidos) por mês.",
        ],
        fonte: "https://www.make-it-in-germany.com/fileadmin/1_Rebrush_2022/a_Fachkraefte/PDF-Dateien/3_Visum_u_Aufenthalt/Visagrafik_EN/Visum_Praktikum_EN.pdf",
      };
    case "DE:trabalho":
      return {
        situacao: "visto",
        titulo: "Visto nacional (Au Pair ou trabalho)",
        detalhes: ["Au Pair é um visto nacional específico; as demais modalidades de trabalho exigem autorização do empregador."],
        alertas: [A_CONFIRMAR],
      };
    case "FR:voluntariado":
      return {
        situacao: "visto",
        titulo: "VLS-T «Volontaire» (Serviço Voluntário Europeu) ou outro, conforme o programa",
        detalhes: ["O VLS-T de voluntário citado pelo governo francês vale para o Serviço Voluntário Europeu; outros voluntariados são tratados caso a caso."],
        alertas: [A_CONFIRMAR],
        fonte: "https://www.france-visas.gouv.fr/en/volontariat",
      };
    case "AU:estagio":
      return {
        situacao: "visto",
        titulo: "Training visa (subclass 407)",
        detalhes: [
          "Estágio ou treinamento ocupacional com patrocinador aprovado e nomeação do trainee.",
          "Atividade temporária sem nomeação cabe no subclass 408; o patrocínio é exigido se o pedido for feito dentro da Austrália ou a estadia passar de 3 meses.",
        ],
        alertas: [ENQUADRAMENTO],
        fonte: "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/training-407",
      };
    case "AU:trabalho":
      return {
        situacao: "visto",
        titulo: "Work and Holiday visa (subclass 462)",
        detalhes: [
          "O Brasil usa o subclass 462 (não o 417): 18 a 30 anos, 12 meses de permanência, cota anual de 500 vagas.",
        ],
        alertas: ["A página oficial de cotas lista o Brasil como pausado: confirme a abertura antes de planejar."],
        fonte: "https://immi.homeaffairs.gov.au/what-we-do/whm-program/status-of-country-caps",
      };
    case "NZ:estagio":
      return {
        situacao: "visto",
        titulo: "Estágio do curso com Student Visa; outro estágio exige Work Visa",
        detalhes: ["Estágio obrigatório que faz parte do curso é permitido no Student Visa e não conta nas 25 horas semanais de trabalho."],
        alertas: ["Estágio fora de curso: tipo de visto a confirmar."],
        fonte: "https://www.immigration.govt.nz/visas/fee-paying-student-visa/",
      };
    case "NZ:voluntariado":
      return {
        situacao: "visto",
        titulo: "Visto de voluntariado — tipo a confirmar",
        detalhes: [
          "Quem já tem Student Visa pode fazer voluntariado se não houver ganho ou recompensa — hospedagem e alimentação em troca contam como recompensa.",
          "Com NZeTA ou Visitor Visa não é permitido trabalhar.",
        ],
        alertas: [A_CONFIRMAR],
        fonte: "https://www.immigration.govt.nz/study/once-you-have-a-student-visa/unpaid-work-while-studying/",
      };
    case "NZ:trabalho":
      return {
        situacao: "visto",
        titulo: "Brazil Working Holiday Visa",
        detalhes: [
          "18 a 30 anos, até 12 meses, no máximo 3 meses por empregador. Taxa a partir de NZD 770; fundos de NZD 4.200.",
          "Cota de 300 vagas por ano.",
        ],
        alertas: ["Fechado para 2026 (vagas esgotadas); reabre em 2027."],
        fonte: "https://www.immigration.govt.nz/visas/brazil-working-holiday-visa/",
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
  const f = categoria === "estudo" ? estudo(pais, dias) : naoEstudo(pais, categoria);
  if (!f) return null;
  const fonte = f.fonte && /^https:\/\//.test(f.fonte) ? f.fonte : null;
  return { categoria, pais, paisNome: NOMES[pais], situacao: f.situacao, titulo: f.titulo, detalhes: f.detalhes, alertas: f.alertas ?? [], fonte };
}
