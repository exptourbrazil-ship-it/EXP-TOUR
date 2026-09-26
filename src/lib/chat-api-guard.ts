// Guarda das rotas PUBLICAS consumidas pelo Chat da Forio (server-to-server):
// /api/public/preco/*, e depois /api/public/diagnostico. Ver
// docs/handoff-diagnostico-chat-forio.md, Secao 4.
//
// Autenticacao por chave de ambiente (CHAT_API_KEY) no header Authorization:
// Bearer <chave>. FALHA FECHADA: sem a variavel, a rota recusa (503) — nunca
// degrada para "sem autenticacao" (CLAUDE.md). O tenant e o do deploy
// (CATALOGO_TENANT_SLUG), como nas demais rotas publicas. Comparacao em tempo
// constante; a chave nunca vai para log. Rate-limit por IP, falha fechada.
//
// NB: server-only (service role). Nunca importar em codigo client.
import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { obterIp, checarELimitar } from "@/lib/rate-limit";

// 120 chamadas por minuto por IP: folga para um backend de chat, barreira para
// varredura.
const LIMITE = 120;
const JANELA_SEGUNDOS = 60;

export type ChatGuardOk = { ok: true; ip: string; supabase: SupabaseClient };
export type ChatGuardFail = { ok: false; response: NextResponse };

export function chatErro(message: string, code: string, status: number): NextResponse {
  const res = NextResponse.json({ ok: false, error: { code, message } }, { status });
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  res.headers.set("Cache-Control", "no-store");
  return res;
}

export function chatOk(data: unknown): NextResponse {
  const res = NextResponse.json({ ok: true, data });
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  res.headers.set("Cache-Control", "no-store");
  return res;
}

// Compara em tempo constante via hash (iguala o tamanho antes de comparar).
export function chaveConfere(recebida: string, esperada: string): boolean {
  if (!recebida || !esperada) return false;
  const a = createHash("sha256").update(recebida).digest();
  const b = createHash("sha256").update(esperada).digest();
  return timingSafeEqual(a, b);
}

// Extrai o bearer do header Authorization; vazio quando ausente/malformado.
export function extrairBearer(header: string | null): string {
  const m = /^Bearer\s+(\S+)$/i.exec(header ?? "");
  return m ? m[1] : "";
}

export async function guardChatApi(request: Request): Promise<ChatGuardOk | ChatGuardFail> {
  const esperada = process.env.CHAT_API_KEY;
  if (!esperada) {
    console.error("CHAT_API_KEY nao configurada: rota publica do chat recusada.");
    return { ok: false, response: chatErro("Serviço não configurado.", "nao_configurado", 503) };
  }
  const recebida = extrairBearer(request.headers.get("authorization"));
  if (!chaveConfere(recebida, esperada)) {
    return { ok: false, response: chatErro("Não autorizado.", "nao_autorizado", 401) };
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );
  const ip = obterIp(request);
  const permitido = await checarELimitar(supabase, `chat-api:ip:${ip}`, LIMITE, JANELA_SEGUNDOS, Date.now(), true);
  if (!permitido) {
    return { ok: false, response: chatErro("Muitas requisições. Tente novamente em instantes.", "rate_limit", 429) };
  }
  return { ok: true, ip, supabase };
}
