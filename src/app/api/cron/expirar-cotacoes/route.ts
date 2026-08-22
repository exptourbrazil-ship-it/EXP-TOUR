import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cron diario: expira cotacoes cujo valid_until ja passou (spec 5.1). So toca
// cotacoes emitidas e ainda nao decididas (issued/viewed); nao mexe em
// option_selected, cancelled nem draft. Idempotente: rodar de novo nao muda nada.
//
// Falha fechada: recusa sem CRON_SECRET, como os demais crons.
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

  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL as string,
      process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    );

    const { data, error } = await supabase
      .from("quote")
      .update({ status: "expired", updated_at: new Date().toISOString() })
      .lt("valid_until", hoje)
      .in("status", ["issued", "viewed"])
      .select("id");
    if (error) throw new Error(error.message);

    const expiradas = data?.length ?? 0;
    return NextResponse.json({ ok: true, expiradas, referencia: hoje });
  } catch (err) {
    console.error("[expirar-cotacoes] falha:", err);
    return NextResponse.json({ ok: false, erro: "Falha ao expirar cotacoes" }, { status: 500 });
  }
}
