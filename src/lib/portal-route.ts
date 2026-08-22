// Helpers server-only para as rotas PUBLICAS do portal do estudante
// (/api/public/quotes/[token]/...). Sem auth: a posse e o proprio token opaco.
// Defesas: formato do token (barra enumeracao malformada), rate-limit por IP e
// por token, e cabecalho noindex. NUNCA importar em codigo client.
import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { obterIp, checarELimitar } from "@/lib/rate-limit";
import { tokenValidoFormato } from "@/lib/quote-issue";

/** Cliente Supabase com service role. A visibilidade e imposta pelo servico (token). */
export function getSupabasePublic(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );
}

// 60 requisicoes por minuto, por IP e por token (spec 9).
const LIMITE = 60;
const JANELA_SEGUNDOS = 60;

export type PortalGuardOk = { ok: true; ip: string; token: string; supabase: SupabaseClient };
export type PortalGuardFail = { ok: false; response: NextResponse };

/** Resposta publica de erro, sempre com noindex. */
export function portalErro(message: string, code: string, status: number): NextResponse {
  const res = NextResponse.json({ ok: false, error: { code, message } }, { status });
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  return res;
}

/** Resposta publica de sucesso, sempre com noindex. */
export function portalOk(data: unknown): NextResponse {
  const res = NextResponse.json({ ok: true, data });
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  return res;
}

/**
 * Guarda das rotas publicas: valida o formato do token e aplica o rate-limit por
 * IP e por token. Nao revela se o token existe (404 generico para malformado).
 */
export async function guardPortal(request: Request, token: string): Promise<PortalGuardOk | PortalGuardFail> {
  if (!tokenValidoFormato(token)) {
    return { ok: false, response: portalErro("Nao encontrado.", "nao_encontrado", 404) };
  }
  const ip = obterIp(request);
  const supabase = getSupabasePublic();

  // Falha fechada de rate-limit nesta superficie publica sem sessao.
  const okIp = await checarELimitar(supabase, `portal:ip:${ip}`, LIMITE, JANELA_SEGUNDOS, Date.now(), true);
  const okToken = await checarELimitar(supabase, `portal:token:${token}`, LIMITE, JANELA_SEGUNDOS, Date.now(), true);
  if (!okIp || !okToken) {
    return { ok: false, response: portalErro("Muitas requisicoes. Tente em instantes.", "rate_limited", 429) };
  }
  return { ok: true, ip, token, supabase };
}
