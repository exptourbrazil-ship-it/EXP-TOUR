// Helpers server-only para as rotas de API do modulo Catalogo/Preco/Cotacao.
// Centraliza: cliente Supabase (service role), guarda por capacidade e respostas
// padronizadas { ok:true, data } | { ok:false, error:{code,message} }.
//
// NB: SERVER-ONLY (service role). Nunca importar em codigo client.
import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  checarCapacidadeAdmin,
  sessaoAdminAtual,
  usuarioAdminAtual,
} from "@/lib/admin-guard";
import type { PapelAdmin } from "@/lib/admin-roles";
import { obterIp } from "@/lib/rate-limit";

/** Cliente Supabase com service role (as rotas escrevem com este cliente). */
export function getSupabase(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );
}

/** Data de hoje em America/Sao_Paulo no formato 'YYYY-MM-DD'. */
export function hojeSaoPauloISO(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date());
}

export type GuardOk = {
  ok: true;
  usuario: string;
  papel: PapelAdmin | null;
  ip: string;
};
export type GuardFail = { ok: false; response: NextResponse };
export type GuardResult = GuardOk | GuardFail;

/**
 * Autorizacao por CAPACIDADE ('propostas.gerir'). Falha fechada: sem sessao com
 * a capacidade -> 401. Retorna o ator (usuario + papel) e o ip para auditoria.
 */
export async function guardCatalog(request: Request): Promise<GuardResult> {
  if (!(await checarCapacidadeAdmin("propostas.gerir"))) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: { code: "nao_autorizado", message: "Nao autorizado." } },
        { status: 401 },
      ),
    };
  }
  const sessao = await sessaoAdminAtual();
  const usuario = (await usuarioAdminAtual()) ?? "bearer-secret";
  return { ok: true, usuario, papel: sessao?.papel ?? null, ip: obterIp(request) };
}

/** Resposta de erro de validacao (400 por padrao). */
export function bad(message: string, code = "invalido", status = 400): NextResponse {
  return NextResponse.json({ ok: false, error: { code, message } }, { status });
}

/**
 * Resposta de erro interno (500) a partir de uma excecao. As mensagens de
 * validacao de negocio (ex.: "Estudante nao encontrado...") sao devolvidas ao
 * cliente; as que embrulham detalhe do banco (prefixo "Falha ao ") sao logadas
 * server-side e substituidas por uma mensagem generica — nao vaza schema/constraint.
 */
export function fail(err: unknown): NextResponse {
  const raw = err instanceof Error ? err.message : "Erro interno.";
  const ehDetalheDeBanco = /^Falha ao /.test(raw);
  if (ehDetalheDeBanco) {
    console.error("[catalog] erro interno:", raw);
  }
  const message = ehDetalheDeBanco ? "Erro interno ao processar a operacao." : raw;
  return NextResponse.json(
    { ok: false, error: { code: "erro_interno", message } },
    { status: 500 },
  );
}

/** Resposta de sucesso. */
export function okData(data: unknown): NextResponse {
  return NextResponse.json({ ok: true, data });
}

/** Valida data ISO 'YYYY-MM-DD'. */
export function isIsoDate(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

/** Valida UUID v4-ish (formato canonico). */
export function isUuid(v: unknown): v is string {
  return (
    typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
  );
}

/**
 * Resolve o id (uuid) do admin a partir do e-mail da sessao (admin_users). As
 * colunas *_user_id do modulo sao uuid; a sessao identifica por e-mail, entao
 * este e o elo. Retorna null se o e-mail nao for um admin cadastrado.
 */
export async function resolverAdminUserId(
  supabase: SupabaseClient,
  email: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("admin_users")
    .select("id")
    .eq("email", email.toLowerCase())
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

/**
 * Confere que uma opcao pertence a uma cotacao (posse) dentro do tenant. Usado
 * pelas rotas /quotes/[id]/... que recebem optionId no corpo.
 */
export async function optionBelongsToQuote(
  supabase: SupabaseClient,
  tenantId: string,
  optionId: string,
  quoteId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("quote_option")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("id", optionId)
    .eq("quote_id", quoteId)
    .maybeSingle();
  return !!data;
}
