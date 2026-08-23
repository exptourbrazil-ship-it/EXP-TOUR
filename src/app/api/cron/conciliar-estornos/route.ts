import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { conciliarEstornosPendentes } from "@/lib/acerto-service";

export const runtime = "nodejs";
export const maxDuration = 60;

// Rede de seguranca da confirmacao de estornos (motor de acerto, Fatia D).
// Reconsulta ao Mercado Pago cada estorno MP pendente (que ja tem refund id) e,
// quando o MP confirma (`approved`), marca o estorno confirmado; quando TODOS os
// estornos de um acerto confirmam, finaliza o acerto (`executado`) e envia o
// recibo. Idempotente (reusa a mesma logica do dispatch). Falha FECHADA sem
// CRON_SECRET.
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!cronSecret) {
    console.error("CRON_SECRET nao configurado: execucao do cron recusada.");
    return NextResponse.json({ ok: false, erro: "Cron nao configurado" }, { status: 503 });
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, erro: "Nao autorizado" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const resumo = await conciliarEstornosPendentes(supabase);
    return NextResponse.json({ ok: true, resumo });
  } catch (err) {
    console.error("[conciliar-estornos] falha na conciliacao");
    return NextResponse.json({ ok: false, erro: "Falha na conciliacao" }, { status: 500 });
  }
}
