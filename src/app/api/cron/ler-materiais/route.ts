import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { tenantIdAtual } from "@/lib/catalog-service";
import { materiaisParaLer, lerMaterial } from "@/lib/material-leitura-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Cada leitura e uma chamada ao modelo com PDF de ate 10 MB (segundos). O teto da
// funcao + MAX_POR_RUN pequeno evitam a funcao ser encerrada no meio (claim preso).
export const maxDuration = 60;

// Teto de leituras por execucao (a IA custa; sequencial dentro de maxDuration).
const MAX_POR_RUN = Number(process.env.CRON_LER_MATERIAIS_MAX || "4");

// Cron da LEITURA de material por IA (F3.1). Uma vez por dia: pega os materiais na
// fila ('pendente', ou 'lendo' com claim obsoleto) — price lists em PDF ja APROVADOS
// pelo admin — le cada um e gera a proposta de preco PENDENTE na fila de aprovacao.
// Falha FECHADA: sem CRON_SECRET, recusa; sem ANTHROPIC_API_KEY, nao toca em nada.
// Bounded por MAX_POR_RUN (o resto entra no proximo ciclo / botao "Ler com IA").
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
    console.error("[cron/ler-materiais] falha ao resolver tenant:", err instanceof Error ? err.message : "erro");
    return NextResponse.json({ ok: false, erro: "Tenant nao resolvido" }, { status: 500 });
  }

  const fila = await materiaisParaLer(supabase, tenantId, MAX_POR_RUN);

  // Sem chave de IA: nao adianta reclamar materiais — ficam na fila intactos.
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ ok: true, fila: fila.length, sem_ia: true, lidos: 0 });
  }

  const resultado = { fila: fila.length, lidos: 0, precisa_campus: 0, reagendados: 0, erros: 0, outros: 0 };
  for (const materialId of fila) {
    const r = await lerMaterial(supabase, { tenantId, materialId, actor: "cron" });
    if (r.status === "lida") resultado.lidos++;
    else if (r.status === "precisa_campus") resultado.precisa_campus++;
    else if (r.status === "pendente") resultado.reagendados++; // falha transitoria: volta a fila
    else if (r.status === "erro") resultado.erros++;
    else resultado.outros++;
  }

  return NextResponse.json({ ok: true, ...resultado });
}
