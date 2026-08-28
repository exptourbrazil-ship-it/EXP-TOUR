import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checarCapacidadeAdmin, usuarioAdminAtual } from "@/lib/admin-guard";
import { tenantIdAtual } from "@/lib/catalog-service";
import { checarELimitar } from "@/lib/rate-limit";
import { conferirFaturaDoContrato } from "@/lib/fatura-conferencia-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Teto de conferências sob demanda por admin (a extração chama a IA — custo).
const JANELA_SEG = Number(process.env.RATE_LIMIT_JANELA_SEG || "600");
const MAX_CONFERIR = Number(process.env.RATE_LIMIT_CONFERIR_FATURA || "30");

// Dispara a conferência (IA) da fatura de um caso, sob demanda pelo Admin.
// Capacidade financeiro.ver (não move dinheiro — só classifica). A conferência
// grava/atualiza o veredito em fatura_conferencia. Rate-limit por admin contra
// abuso de custo de IA.
export async function POST(request: Request) {
  if (!(await checarCapacidadeAdmin("financeiro.ver"))) {
    return NextResponse.json({ ok: false, erro: "Nao autorizado" }, { status: 401 });
  }
  const adminUser = (await usuarioAdminAtual()) ?? "admin";
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string);

  if (!(await checarELimitar(supabase, `admin-conferir-fatura:${adminUser}`, MAX_CONFERIR, JANELA_SEG))) {
    return NextResponse.json({ ok: false, erro: "Muitas conferências em pouco tempo. Aguarde alguns minutos." }, { status: 429 });
  }

  let tenantId: string;
  try {
    tenantId = await tenantIdAtual(supabase);
  } catch (err) {
    return NextResponse.json({ ok: false, erro: err instanceof Error ? err.message : "Falha ao resolver o tenant." }, { status: 500 });
  }

  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const contratoId = String(body?.contratoId || "");
  if (!contratoId) return NextResponse.json({ ok: false, erro: "Informe o caso." }, { status: 400 });

  const conferencia = await conferirFaturaDoContrato(supabase, tenantId, contratoId);
  return NextResponse.json({ ok: true, conferencia });
}
