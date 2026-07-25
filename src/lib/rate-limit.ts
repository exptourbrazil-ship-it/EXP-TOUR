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
  agoraMs: number = Date.now()
): Promise<boolean> {
  const janelaMs = janelaSegundos * 1000;
  const inicioISO = new Date(agoraMs - janelaMs).toISOString();

  try {
    const { data, error } = await supabase
      .from("rate_limit_hits")
      .select("criado_em")
      .eq("chave", chave)
      .gte("criado_em", inicioISO);

    if (error) return true; // falha aberta

    const timestamps = (data || []).map((r: any) => new Date(r.criado_em).getTime());
    if (excedeuLimite(contarDentroDaJanela(timestamps, agoraMs, janelaMs), limite)) {
      return false;
    }

    await supabase.from("rate_limit_hits").insert({ chave });
    return true;
  } catch {
    return true; // falha aberta
  }
}

// Helper puro (testavel): calcula o timestamp de corte para a limpeza. Linhas
// com criado_em ANTERIOR a este corte ja passaram muito da janela de rate-limit
// (minutos) e podem ser apagadas com seguranca. retencaoHoras define quanto
// tempo de historico manter (ex.: 24h).
export function calcularCorteRetencaoISO(agoraMs: number, retencaoHoras: number): string {
  return new Date(agoraMs - retencaoHoras * 3600 * 1000).toISOString();
}

// Extrai o IP do cliente a partir dos headers (Vercel popula x-forwarded-for).
export function obterIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "desconhecido";
}
