import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { enviarAvisoInternoEmail } from "@/lib/email";
import { varrerRetaguarda } from "@/lib/retaguarda-service";
import { montarResumoAlertaRetaguarda } from "@/lib/retaguarda-alerta";

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

  let r: Awaited<ReturnType<typeof varrerRetaguarda>>;
  try {
    r = await varrerRetaguarda(supabase);
  } catch (err) {
    console.error("[retaguarda] varredura falhou:", err instanceof Error ? err.message : "erro");
    return NextResponse.json({ ok: false, erro: "Varredura falhou" }, { status: 500 });
  }

  // Alerta interno dos achados ALTO NOVOS desta rodada. Best-effort: falha de
  // e-mail não derruba a varredura (o painel continua sendo a fonte de verdade).
  let alertado = false;
  if (r.novosAlto.length > 0) {
    try {
      const marca = await nomeDoTenant(supabase, r.tenantId);
      const resumo = montarResumoAlertaRetaguarda({
        novos: r.novosAlto.map((a) => ({ categoria: a.categoria, resumo: a.resumo })),
        marca,
        appUrl: process.env.NEXT_PUBLIC_APP_URL,
      });
      if (resumo) {
        await enviarAvisoInternoEmail(resumo.assunto, resumo.texto);
        alertado = true;
      }
    } catch (err) {
      console.error("[retaguarda] falha ao enviar alerta interno:", err instanceof Error ? err.message : "erro");
    }
  }

  // Não serializa novosAlto (lista) no JSON — só os contadores + alertado.
  return NextResponse.json({
    ok: true,
    tenantId: r.tenantId,
    contratos: r.contratos,
    novos: r.novos,
    reabertos: r.reabertos,
    mantidos: r.mantidos,
    resolvidos: r.resolvidos,
    abertosTotal: r.abertosTotal,
    alertado,
  });
}

// Nome de marca do tenant para o assunto (fallback: id). Mesmo padrão dos demais
// crons de alerta.
async function nomeDoTenant(supabase: SupabaseClient, tenantId: string): Promise<string> {
  const { data } = await supabase.from("tenant").select("name, slug").eq("id", tenantId).maybeSingle();
  const nome = (data as { name?: string; slug?: string } | null);
  return (nome?.name && nome.name.trim()) || nome?.slug || tenantId;
}
