// Preambulo comum das rotas /api/admin/contas-a-receber/**: sessao admin com a
// capacidade certa (SEM bearer: dinheiro precisa de um QUEM identificavel na
// trilha), cliente com service role, tenant do deploy e IP.
import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { checarCapacidadeAdmin, usuarioAdminAtual } from "@/lib/admin-guard";
import { tenantIdAtual } from "@/lib/catalog-service";
import { obterIp } from "@/lib/rate-limit";

export type ContextoAdminFatura = { supabase: SupabaseClient; tenantId: string; adminUser: string; ip: string };

export async function contextoAdminFatura(
  request: Request,
  capacidade: "financeiro.ver" | "financeiro.gerir",
): Promise<{ ok: true; ctx: ContextoAdminFatura } | { ok: false; res: NextResponse }> {
  if (!(await checarCapacidadeAdmin(capacidade))) {
    return { ok: false, res: NextResponse.json({ ok: false, erro: "Nao autorizado" }, { status: 401 }) };
  }
  const adminUser = await usuarioAdminAtual();
  if (!adminUser) return { ok: false, res: NextResponse.json({ ok: false, erro: "Sessao invalida" }, { status: 401 }) };
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string);
  try {
    const tenantId = await tenantIdAtual(supabase);
    return { ok: true, ctx: { supabase, tenantId, adminUser, ip: obterIp(request) } };
  } catch (err) {
    return { ok: false, res: NextResponse.json({ ok: false, erro: err instanceof Error ? err.message : "Falha ao resolver o tenant." }, { status: 500 }) };
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ehUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);
