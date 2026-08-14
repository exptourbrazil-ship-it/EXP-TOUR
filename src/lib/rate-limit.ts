// Rate limiting simples persistido no Supabase (a tabela rate_limit_hits).
// Necessario porque o ambiente e serverless (Vercel) e nao ha estado em
// memoria confiavel entre invocacoes. Cada tentativa registra um "hit" com uma
// chave (ex.: "req-code:ip:1.2.3.4") e um timestamp; o limite e checado contando
// os hits dentro de uma janela de tempo.

import type { SupabaseClient } from "@supabase/supabase-js";

// Helper puro (testavel): quantos timestamps caem na janela [agora - janela, agora].
export function contarDentroDaJanela(
  timestampsMs: number[],
  agoraMs: number,
  janelaMs: number
): number {
  const inicio = agoraMs - janelaMs;
  return timestampsMs.filter((t) => t >= inicio && t <= agoraMs).length;
}

export function excedeuLimite(quantidade: number, limite: number): boolean {
  return quantidade >= limite;
}

// Verifica o rate limit para uma chave e, se ainda dentro do limite, registra
// o hit atual. Retorna true se a requisicao E PERMITIDA (abaixo do limite) e
// false se deve ser bloqueada (429). Falha "aberta" (permite) em caso de erro
// de banco, para nao derrubar o login por um problema transitorio.
export async function checarELimitar(
  supabase: SupabaseClient,
  chave: string,
  limite: number,
  janelaSegundos: number,
  agoraMs: number = Date.now(),
  // Como se comportar quando o banco falha. O padrao (falha aberta) evita
  // derrubar fluxos comuns por um problema transitorio. Em superficie de
  // autenticacao passe true: sem o contador nao ha defesa contra forca bruta,
  // e permitir "por seguranca" e justamente o que abre a porta.
  falharFechado: boolean = false
): Promise<boolean> {
  const janelaMs = janelaSegundos * 1000;
  const inicioISO = new Date(agoraMs - janelaMs).toISOString();

  try {
    // Registra a tentativa ANTES de contar. Com select-depois-insert, N
    // requisicoes concorrentes liam a mesma contagem e todas passavam — o
    // limite so valia para trafego serializado. Contando depois de inserir, a
    // propria tentativa ja esta no total e a corrida deixa de render palpites
    // extras.
    const { error: insErr } = await supabase.from("rate_limit_hits").insert({ chave });
    if (insErr) return !falharFechado;

    const { data, error } = await supabase
      .from("rate_limit_hits")
      .select("criado_em")
      .eq("chave", chave)
      .gte("criado_em", inicioISO);

    if (error) return !falharFechado;

    const timestamps = (data || []).map((r: any) => new Date(r.criado_em).getTime());
    // O hit atual ja esta contado, entao o limite e excedido a partir de
    // limite + 1 ocorrencias.
    return !excedeuLimite(contarDentroDaJanela(timestamps, agoraMs, janelaMs), limite + 1);
  } catch {
    return !falharFechado;
  }
}

// Helper puro (testavel): calcula o timestamp de corte para a limpeza. Linhas
// com criado_em ANTERIOR a este corte ja passaram muito da janela de rate-limit
// (minutos) e podem ser apagadas com seguranca. retencaoHoras define quanto
// tempo de historico manter (ex.: 24h).
export function calcularCorteRetencaoISO(agoraMs: number, retencaoHoras: number): string {
  return new Date(agoraMs - retencaoHoras * 3600 * 1000).toISOString();
}

// Extrai o IP do cliente.
//
// Ordem importa. `x-vercel-forwarded-for` e preenchido pela borda da Vercel e
// nao pode ser forjado pelo cliente. Ja `x-forwarded-for` e uma cadeia onde o
// PRIMEIRO valor e o que o cliente mandou: usar a primeira posicao permitia
// rotacionar o header e ganhar um balde de rate limit novo a cada requisicao,
// alem de envenenar o IP gravado na auditoria administrativa e no registro de
// aceite (que e prova legal). Por isso, no fallback, pegamos o ULTIMO salto —
// o que foi acrescentado pelo proxy mais proximo de nos.
export function obterIp(request: Request): string {
  const vercel = request.headers.get("x-vercel-forwarded-for");
  if (vercel) return vercel.split(",")[0].trim();

  const real = request.headers.get("x-real-ip");
  if (real) return real.trim();

  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const saltos = xff.split(",").map((s) => s.trim()).filter(Boolean);
    if (saltos.length > 0) return saltos[saltos.length - 1];
  }

  return "desconhecido";
}
