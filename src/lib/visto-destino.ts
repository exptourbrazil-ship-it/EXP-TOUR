// Card de visto da cotacao: qual visto/autorizacao o brasileiro precisa para o
// programa apresentado, por pais de destino e duracao do curso.
//
// Fonte: pagina "RELATORIO: VISTOS E ENTRADAS DE BRASILEIROS NO EXTERIOR —
// 2025/2026" (Notion, referencia jun/2026), secao "Regime de visto" de cada
// pais. Regra de negocio, nao calculo: puro e testavel. Quando a regra mudar,
// atualize aqui e `VISTO_REFERENCIA`.

export const VISTO_REFERENCIA = "junho de 2026";

export type SituacaoVisto = "isento" | "autorizacao" | "visto";

export type CartaoVisto = {
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
    titulo: "Isento de visto (até 90 dias)",
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
            titulo: "Isento de visto (até 90 dias)",
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
        : { situacao: "isento", titulo: "Isento de visto (até 90 dias)", detalhes: ["Brasileiros entram nos Emirados sem visto desde 2018, por até 90 dias.", "Estudo formal exige visto."] };
    default:
      return null;
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
  const f = faixaDoPais(pais, dias);
  if (!f) return null;
  return { pais, paisNome: NOMES[pais], situacao: f.situacao, titulo: f.titulo, detalhes: f.detalhes, alertas: f.alertas ?? [] };
}
