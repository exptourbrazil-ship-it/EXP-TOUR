import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { varrerRetaguarda } from "@/lib/retaguarda-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Camada detectiva de retaguarda (Vercel Cron, diario). Varre os dados do tenant
// do deploy, detecta inconsistencias (retaguarda.ts), reconcilia com o estado
// persistido e grava os achados em `retaguarda_achado`. NAO muta dado de negocio
// (LGPD art. 20 / spec 7-F.2): so flagra para verificacao humana. O painel de
// saude (doc 07 §3.8) e o alerta consomem os achados nas fatias seguintes.
//
// Escopo por tenant e FALHA FECHADA vem do varrerRetaguarda (resolverEscopoTenant).
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

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string
  );

  try {
    const resumo = await varrerRetaguarda(supabase);
    return NextResponse.json({ ok: true, ...resumo });
  } catch (err) {
    console.error("[retaguarda] varredura falhou:", err instanceof Error ? err.message : "erro");
    return NextResponse.json({ ok: false, erro: "Varredura falhou" }, { status: 500 });
  }
}
