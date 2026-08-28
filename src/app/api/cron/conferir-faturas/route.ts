import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { tenantIdAtual } from "@/lib/catalog-service";
import { listarContasAPagar } from "@/lib/payout-admin-service";
import { conferirFaturaDoContrato, contratosSemConferencia } from "@/lib/fatura-conferencia-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Teto de conferências por execução (a extração chama a IA — custo/tempo).
const MAX_POR_RUN = Number(process.env.CRON_CONFERIR_FATURAS_MAX || "20");

// Cron da conferência automática de fatura (doc 05). Uma vez por dia: para os
// casos na fila de contas a pagar que ainda não têm veredito, baixa a fatura,
// extrai por IA e confere contra a previsão. Falha FECHADO: sem CRON_SECRET,
// recusa. Bounded por MAX_POR_RUN (o resto entra no próximo ciclo / sob demanda).
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
  const tenantId = await tenantIdAtual(supabase);

  const contas = await listarContasAPagar(supabase, tenantId);
  const pendentes = await contratosSemConferencia(supabase, tenantId, contas.map((c) => c.contratoId));
  const alvo = pendentes.slice(0, MAX_POR_RUN);

  const resultado = { fila: contas.length, sem_conferencia: pendentes.length, conferidos: 0, divergentes: 0, sem_fatura: 0, erros: 0 };
  for (const contratoId of alvo) {
    try {
      const r = await conferirFaturaDoContrato(supabase, tenantId, contratoId);
      if (r.status === "conferida") resultado.conferidos++;
      else if (r.status === "divergente") resultado.divergentes++;
      else if (r.status === "sem_fatura") resultado.sem_fatura++;
      else resultado.erros++;
    } catch {
      resultado.erros++;
    }
  }

  return NextResponse.json({ ok: true, ...resultado });
}
