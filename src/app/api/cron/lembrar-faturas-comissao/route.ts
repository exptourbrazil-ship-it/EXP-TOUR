import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { bearerConfere } from "@/lib/segredo";
import { resolverEscopoTenant } from "@/lib/cron-tenant";
import { enviarLembretesDoDia } from "@/lib/comissao-fatura-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Cron diario de lembretes das faturas de comissao enviadas as escolas: 3 dias antes
// do vencimento, no dia, e com 1, 15 e 30 dias de atraso. Cada marco de cada fatura
// e reivindicado no ledger `events` (chave unica) ANTES do envio — rodar duas vezes
// no dia nao duplica e-mail. Falha FECHADA: sem CRON_SECRET, recusa.
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("CRON_SECRET nao configurado: execucao do cron recusada.");
    return NextResponse.json({ ok: false, erro: "Cron nao configurado" }, { status: 503 });
  }
  if (!bearerConfere(request.headers.get("authorization"), cronSecret)) {
    return NextResponse.json({ ok: false, erro: "Nao autorizado" }, { status: 401 });
  }
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string);
  try {
    const { tenantId } = await resolverEscopoTenant(supabase);
    const r = await enviarLembretesDoDia(supabase, tenantId);
    return NextResponse.json({ ok: true, ...r });
  } catch (err) {
    console.error("[lembrar-faturas-comissao] falha:", err instanceof Error ? err.message : "erro");
    return NextResponse.json({ ok: false, erro: "Falha ao enviar os lembretes" }, { status: 500 });
  }
}
