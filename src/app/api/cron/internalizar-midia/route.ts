import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { tenantIdAtual } from "@/lib/catalog-service";
import { internalizarFavicons, internalizarMidias } from "@/lib/midia-internalizacao-service";
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

  const inicio = Date.now();
  try {
    const r = await internalizarMidias(supabase, tenantId, {
      max: numeroEnv(process.env.CRON_MIDIA_MAX, 30),
      orcamentoMs: numeroEnv(process.env.CRON_MIDIA_ORCAMENTO_MS, 35_000),
    });
    // Favicon da escola pelo MESMO motivo das fotos (CSP img-src). Sao poucas
    // linhas (uma por fornecedor) e so as ainda externas entram, entao roda depois
    // sem orcamento proprio. Falha aqui nao invalida o lote de fotos.
    // Orcamento = o que sobrou de maxDuration, menos folga para responder. Sem
    // isso, um punhado de sites fora do ar (15 s cada) estouraria a funcao e o
    // cron devolveria 504 todo dia, sem nunca fechar a fila.
    const restanteMs = 60_000 - (Date.now() - inicio) - 5_000;
    let favicons: Awaited<ReturnType<typeof internalizarFavicons>> | { erro: string } | { pulado: string };
    if (restanteMs < 3_000) {
      favicons = { pulado: "sem tempo nesta execucao" };
    } else try {
      favicons = await internalizarFavicons(supabase, tenantId, { orcamentoMs: restanteMs, max: 10 });
    } catch (err) {
      favicons = { erro: err instanceof Error ? err.message : "erro" };
    }
    // Erros resumidos (sem URL) — a URL de origem fica em campus_media.source_url/url.
    return NextResponse.json({ ok: true, ...r, erros: r.erros.slice(0, 10), favicons });
  } catch (err) {
    console.error("[cron/internalizar-midia] falha:", err instanceof Error ? err.message : "erro");
    return NextResponse.json({ ok: false, erro: "Falha na internalizacao" }, { status: 500 });
  }
}
