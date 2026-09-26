// Nucleo PURO da FAIXA DE PRECO derivada do catalogo (item 0.5a do plano do
// Diagnostico Forio, docs/plano-diagnostico-forio.md). Sem rede/DB.
//
// A faixa serve SO ao "escape de preco" do Chat da Forio antes de destino e
// duracao estarem fechados: quem pede preco em qualquer pergunta recebe uma
// faixa honesta (p25 / mediana / p75) com o que esta incluido — nunca "a partir
// de" com o piso. Com destino + semanas, a resposta passa a ser o numero real
// do motor (src/lib/preco-opcoes.ts).
//
// Derivacao: para cada programa precificavel que aceita N semanas, monta o
// orcamento completo (curso + acomodacao + matricula + material + seguro) com
// `montarOrcamento` e agrega por destino. Dois niveis de destino: PAIS (rotulo,
// ex.: "UK") e CIDADE (ex.: "London"). O cron grava as linhas; o endpoint le.
import {
  montarOrcamento,
  converterBRL,
  type ProgramaOrcavel,
} from "./orcamento.ts";

// Buckets de semanas publicados na faixa. O endpoint aproxima pedidos fora
// da lista para o bucket mais proximo (ver bucketMaisProximo).
export const SEMANAS_FAIXA: readonly number[] = [2, 4, 8, 12] as const;

export type NivelDestino = "pais" | "cidade";

export type FaixaDerivada = {
  nivel: NivelDestino;
  destino: string; // rotulo do pais ou nome da cidade, como no catalogo
  pais: string; // rotulo do pais (para a cidade, o pais dela)
  semanas: number;
  moeda: string;
  p25: number;
  mediana: number;
  p75: number;
  p25Brl: number | null;
  medianaBrl: number | null;
  p75Brl: number | null;
  amostra: number; // quantos programas entraram
  inclui: string[]; // linhas do orcamento presentes na maioria da amostra
};

// Percentil por interpolacao linear (tipo 7, o mesmo do R/NumPy padrao).
// Lista vazia -> 0. Nao muta a entrada.
export function percentil(valores: number[], p: number): number {
  if (valores.length === 0) return 0;
  const v = [...valores].sort((a, b) => a - b);
  if (v.length === 1) return v[0];
  const pos = (v.length - 1) * Math.min(1, Math.max(0, p));
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return v[lo];
  return v[lo] + (v[hi] - v[lo]) * (pos - lo);
}

const round0 = (n: number) => Math.round(n);

// Tipo de acomodacao usado na faixa: homestay quando existe (o mais comum e o
// mais barato), senao residencia. Programa sem acomodacao no campus entra sem
// essa linha — e "inclui" deixa claro.
function tipoAcomodacao(p: ProgramaOrcavel): "homestay" | "residence" | null {
  if (!p.accom) return null;
  if (p.accom.homestay && p.accom.homestay > 0) return "homestay";
  if (p.accom.residence && p.accom.residence > 0) return "residence";
  return null;
}

// Programa aceita N semanas? Pacote fixo so conta no seu tamanho exato.
export function aceitaSemanas(p: ProgramaOrcavel, semanas: number): boolean {
  if (p.fixedFee) return p.maxWeeks === semanas;
  return semanas >= p.minWeeks && semanas <= p.maxWeeks;
}

type Amostra = { total: number; linhas: string[]; moeda: string; pais: string };

function amostraDoPrograma(p: ProgramaOrcavel, semanas: number): Amostra | null {
  if (!aceitaSemanas(p, semanas)) return null;
  const accomType = tipoAcomodacao(p);
  const orc = montarOrcamento(p, {
    weeks: semanas,
    accomOn: accomType !== null,
    accomType: accomType ?? "homestay",
    insuranceOn: true,
  });
  if (!(orc.totalMoeda > 0) || !(orc.curso > 0)) return null;
  return { total: orc.totalMoeda, linhas: orc.linhas.map((l) => l.chave), moeda: p.currency, pais: p.country };
}

function agregar(
  nivel: NivelDestino,
  destino: string,
  semanas: number,
  amostras: Amostra[],
  cambio: Record<string, number>,
): FaixaDerivada | null {
  // Uma faixa so faz sentido numa moeda. Se um destino misturar moedas (nao
  // acontece por cidade; por pais tambem nao no catalogo atual), usa a
  // dominante e descarta o resto — nunca soma moedas diferentes.
  const porMoeda = new Map<string, Amostra[]>();
  for (const a of amostras) porMoeda.set(a.moeda, [...(porMoeda.get(a.moeda) ?? []), a]);
  let moeda = "";
  let lista: Amostra[] = [];
  for (const [m, l] of porMoeda) if (l.length > lista.length) { moeda = m; lista = l; }
  if (lista.length === 0) return null;

  const totais = lista.map((a) => a.total);
  const p25 = round0(percentil(totais, 0.25));
  const mediana = round0(percentil(totais, 0.5));
  const p75 = round0(percentil(totais, 0.75));

  // "inclui": linhas presentes em pelo menos metade da amostra.
  const contagem = new Map<string, number>();
  for (const a of lista) for (const c of new Set(a.linhas)) contagem.set(c, (contagem.get(c) ?? 0) + 1);
  const ordem = ["curso", "acomodacao", "matricula", "material", "seguro"];
  const inclui = ordem.filter((c) => (contagem.get(c) ?? 0) * 2 >= lista.length);

  const vet = cambio[moeda];
  const brl = (v: number) => (vet > 0 ? converterBRL(v, vet) : null);

  return {
    nivel,
    destino,
    pais: lista[0].pais,
    semanas,
    moeda,
    p25,
    mediana,
    p75,
    p25Brl: brl(p25),
    medianaBrl: brl(mediana),
    p75Brl: brl(p75),
    amostra: lista.length,
    inclui,
  };
}

// Calcula todas as faixas (pais x semanas e cidade x semanas) para o catalogo
// dado. Destinos sem programa que aceite o bucket nao geram linha.
export function calcularFaixas(
  programas: ProgramaOrcavel[],
  cambio: Record<string, number>,
  semanasList: readonly number[] = SEMANAS_FAIXA,
): FaixaDerivada[] {
  const out: FaixaDerivada[] = [];
  for (const semanas of semanasList) {
    const porPais = new Map<string, Amostra[]>();
    const porCidade = new Map<string, Amostra[]>();
    for (const p of programas) {
      const a = amostraDoPrograma(p, semanas);
      if (!a) continue;
      porPais.set(p.country, [...(porPais.get(p.country) ?? []), a]);
      porCidade.set(p.city, [...(porCidade.get(p.city) ?? []), a]);
    }
    for (const [pais, lista] of porPais) {
      const f = agregar("pais", pais, semanas, lista, cambio);
      if (f) out.push(f);
    }
    for (const [cidade, lista] of porCidade) {
      const f = agregar("cidade", cidade, semanas, lista, cambio);
      if (f) out.push(f);
    }
  }
  return out;
}

// Bucket publicado mais proximo do pedido (empate -> o menor, para nao inflar).
export function bucketMaisProximo(semanas: number, buckets: readonly number[] = SEMANAS_FAIXA): number {
  const s = Math.max(1, Math.floor(Number(semanas) || 0));
  let melhor = buckets[0];
  for (const b of buckets) {
    if (Math.abs(b - s) < Math.abs(melhor - s)) melhor = b;
  }
  return melhor;
}
