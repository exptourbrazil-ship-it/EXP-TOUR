import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { tenantIdAtual } from "@/lib/catalog-service";
import { internalizarMidias } from "@/lib/midia-internalizacao-service";
import { numeroEnv } from "@/lib/midia-internalizacao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Cron da INTERNALIZACAO de midia do catalogo: copia fotos de campus (hotlink para o
// site da escola) para o bucket publico midia-catalogo e troca a URL. Uma vez por dia;
// bounded por CRON_MIDIA_MAX linhas e ~35 s. Falha FECHADA: sem CRON_SECRET, recusa.
// Uma linha que falha 5 vezes sai da fila (motivo em
// campus_media.internalize_error).
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("CRON_SECRET nao configurado: execucao do cron recusada.");
    return NextResponse.json({ ok: false, erro: "Cron nao configurado" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, erro: "Nao autorizado" }, { status: 401 });
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string);
  let tenantId: string;
  try {
    tenantId = await tenantIdAtual(supabase);
  } catch (err) {
    console.error("[cron/internalizar-midia] falha ao resolver tenant:", err instanceof Error ? err.message : "erro");
    return NextResponse.json({ ok: false, erro: "Tenant nao resolvido" }, { status: 500 });
  }

  try {
    const r = await internalizarMidias(supabase, tenantId, {
      max: numeroEnv(process.env.CRON_MIDIA_MAX, 30),
      orcamentoMs: numeroEnv(process.env.CRON_MIDIA_ORCAMENTO_MS, 35_000),
    });
    // Erros resumidos (sem URL) — a URL de origem fica em campus_media.source_url/url.
    return NextResponse.json({ ok: true, ...r, erros: r.erros.slice(0, 10) });
  } catch (err) {
    console.error("[cron/internalizar-midia] falha:", err instanceof Error ? err.message : "erro");
    return NextResponse.json({ ok: false, erro: "Falha na internalizacao" }, { status: 500 });
  }
}
