// Nucleo PURO das rotas publicas de PRECO consumidas pelo Chat da Forio
// (docs/handoff-diagnostico-chat-forio.md, Secao 4). Sem rede/DB:
//  - resolver o destino digitado em linguagem natural ("Londres", "Malta",
//    "Canadá") para cidade/pais do catalogo;
//  - montar ate 3 OPCOES com preco real (motor de src/lib/orcamento.ts) e os
//    motivos de exclusao das demais, para o chat justificar por escrito.
//
// O chat NAO calcula: consulta e cita. Tudo aqui e deterministico.
import {
  montarOrcamento,
  converterBRL,
  normalizar,
  type ProgramaOrcavel,
  type Orcamento,
} from "./orcamento.ts";
import { aceitaSemanas } from "./faixa-preco.ts";

// Nomes em portugues (e variantes) -> como o catalogo grava a cidade ou o
// rotulo do pais. Comparacao sempre normalizada (sem acento/caixa).
const CIDADES_PT: Record<string, string> = {
  londres: "London",
  "nova york": "New York",
  "nova iorque": "New York",
  "sao francisco": "San Francisco",
  dublim: "Dublin",
  "st pauls bay": "St. Paul's Bay",
  "saint pauls bay": "St. Paul's Bay",
  "st. pauls bay": "St. Paul's Bay",
  "st paul's bay": "St. Paul's Bay",
};

const PAISES_PT: Record<string, string> = {
  "reino unido": "UK",
  inglaterra: "UK",
  uk: "UK",
  "united kingdom": "UK",
  "gra bretanha": "UK",
  "gra-bretanha": "UK",
  "estados unidos": "US",
  eua: "US",
  us: "US",
  usa: "US",
  "united states": "US",
  canada: "Canada",
  irlanda: "Ireland",
  ireland: "Ireland",
  malta: "Malta",
  "nova zelandia": "New Zealand",
  "new zealand": "New Zealand",
};

export type DestinoResolvido =
  | { nivel: "cidade"; destino: string; pais: string }
  | { nivel: "pais"; destino: string }
  | null;

// Resolve o texto do destino contra o catalogo carregado (cidades/paises
// realmente existentes). Cidade tem prioridade sobre pais. Nao encontrado -> null.
export function resolverDestino(texto: string, programas: ProgramaOrcavel[]): DestinoResolvido {
  const t = normalizar(texto).replace(/[.']/g, "").replace(/\s+/g, " ").trim();
  if (!t) return null;

  const cidades = new Map<string, { cidade: string; pais: string }>();
  const paises = new Set<string>();
  for (const p of programas) {
    cidades.set(normalizar(p.city).replace(/[.']/g, ""), { cidade: p.city, pais: p.country });
    paises.add(p.country);
  }

  const cidadeMapeada = CIDADES_PT[t];
  const chaveCidade = cidadeMapeada ? normalizar(cidadeMapeada).replace(/[.']/g, "") : t;
  const c = cidades.get(chaveCidade);
  if (c) return { nivel: "cidade", destino: c.cidade, pais: c.pais };

  const paisMapeado = PAISES_PT[t];
  const candidatosPais = [paisMapeado, texto.trim()].filter(Boolean) as string[];
  for (const cand of candidatosPais) {
    for (const p of paises) {
      if (normalizar(p) === normalizar(cand)) return { nivel: "pais", destino: p };
    }
  }
  return null;
}

export type PedidoOpcoes = {
  destino?: string | null; // texto livre; vazio = qualquer destino
  semanas: number;
  acomodacao: "homestay" | "residence" | "none";
  seguro: boolean;
  orcamentoMaxBrl?: number | null; // teto em BRL (total), opcional
  termo?: string | null; // termo de busca (ex.: "executivo", "juridico"), opcional
  limite?: number; // max 3
};

export type OpcaoPreco = {
  programaId: string;
  slug: string;
  curso: string;
  tipoCurso: string;
  escola: string;
  cidade: string;
  pais: string;
  moeda: string;
  semanas: number;
  linhas: Orcamento["linhas"];
  totalMoeda: number;
  totalBrl: number | null;
  escolaUrl: string | null;
  programaUrl: string | null;
};

export type MotivoExclusao = "fora_da_duracao" | "acima_do_orcamento" | "sem_cambio" | "fora_do_destino" | "limite";

export type ResultadoOpcoes = {
  opcoes: OpcaoPreco[];
  excluidas: Record<MotivoExclusao, number>;
  dataCambio: string;
  destino: DestinoResolvido;
};

export const LIMITE_OPCOES = 3;

// Monta as opcoes. Ranking: dentro do orcamento, mais baratas primeiro em BRL
// (ou na moeda, se nao houver cambio). Uma opcao por escola, para o chat nao
// apresentar tres cursos da mesma casa como se fossem tres escolhas.
export function montarOpcoes(
  pedido: PedidoOpcoes,
  programas: ProgramaOrcavel[],
  cambio: Record<string, number>,
  dataCambio: string,
): ResultadoOpcoes {
  const semanas = Math.max(1, Math.floor(Number(pedido.semanas) || 0));
  const limite = Math.min(LIMITE_OPCOES, Math.max(1, Math.floor(pedido.limite ?? LIMITE_OPCOES)));
  const excluidas: Record<MotivoExclusao, number> = {
    fora_da_duracao: 0, acima_do_orcamento: 0, sem_cambio: 0, fora_do_destino: 0, limite: 0,
  };

  const destino = pedido.destino ? resolverDestino(pedido.destino, programas) : null;
  const termo = pedido.termo ? normalizar(pedido.termo) : "";

  const candidatas: OpcaoPreco[] = [];
  for (const p of programas) {
    if (destino) {
      const bate = destino.nivel === "cidade" ? p.city === destino.destino : p.country === destino.destino;
      if (!bate) { excluidas.fora_do_destino += 1; continue; }
    }
    if (termo && !normalizar(`${p.courseName} ${p.courseType} ${p.school}`).includes(termo)) {
      continue; // termo e filtro brando: nao conta como exclusao "justificavel"
    }
    if (!aceitaSemanas(p, semanas)) { excluidas.fora_da_duracao += 1; continue; }

    const accomOn = pedido.acomodacao !== "none" && !!p.accom && Number(p.accom[pedido.acomodacao as "homestay" | "residence"] || 0) > 0;
    const orc = montarOrcamento(p, {
      weeks: semanas,
      accomOn,
      accomType: pedido.acomodacao === "none" ? "homestay" : pedido.acomodacao,
      insuranceOn: pedido.seguro,
    });
    if (!(orc.curso > 0)) continue;

    const vet = cambio[p.currency];
    const totalBrl = vet > 0 ? converterBRL(orc.totalMoeda, vet) : null;
    if (pedido.orcamentoMaxBrl && pedido.orcamentoMaxBrl > 0) {
      if (totalBrl == null) { excluidas.sem_cambio += 1; continue; }
      if (totalBrl > pedido.orcamentoMaxBrl) { excluidas.acima_do_orcamento += 1; continue; }
    }

    candidatas.push({
      programaId: p.id,
      slug: p.slug,
      curso: p.courseName,
      tipoCurso: p.courseType,
      escola: p.school,
      cidade: p.city,
      pais: p.country,
      moeda: p.currency,
      semanas,
      linhas: orc.linhas,
      totalMoeda: orc.totalMoeda,
      totalBrl,
      escolaUrl: p.escolaUrl ?? null,
      programaUrl: p.programaUrl ?? null,
    });
  }

  candidatas.sort((a, b) => {
    const ka = a.totalBrl ?? Number.MAX_SAFE_INTEGER;
    const kb = b.totalBrl ?? Number.MAX_SAFE_INTEGER;
    return ka - kb || a.totalMoeda - b.totalMoeda || a.curso.localeCompare(b.curso, "pt-BR");
  });

  const escolasVistas = new Set<string>();
  const opcoes: OpcaoPreco[] = [];
  for (const c of candidatas) {
    if (opcoes.length >= limite) { excluidas.limite += 1; continue; }
    if (escolasVistas.has(c.escola)) { excluidas.limite += 1; continue; }
    escolasVistas.add(c.escola);
    opcoes.push(c);
  }

  return { opcoes, excluidas, dataCambio, destino };
}
