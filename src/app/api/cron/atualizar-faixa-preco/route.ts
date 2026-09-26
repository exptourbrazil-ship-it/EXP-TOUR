import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { tenantIdAtual } from "@/lib/catalog-service";
import { carregarCatalogoOrcamento } from "@/lib/orcamento-catalogo";
import { calcularFaixas } from "@/lib/faixa-preco";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cron diario (18:30 UTC, logo apos atualizar-cambio): recalcula a FAIXA DE
// PRECO derivada do catalogo (p25 / mediana / p75 por destino x semanas) e
// grava em `faixa_preco` para o Chat da Forio consultar no escape de preco.
// Idempotente: upsert por (tenant, nivel, destino, semanas). Linhas com
// origem = 'manual' (fixadas no admin) NAO sao sobrescritas. Linhas derivadas
// que deixaram de ter amostra sao apagadas (destino sem programa que aceite o
// bucket nao pode continuar publicado).
//
// Multi-tenant: escopa pelo tenant do deploy (CATALOGO_TENANT_SLUG), como o
// catalogo. Falha fechada: recusa sem CRON_SECRET.
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

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL as string,
      process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    );
    const tenantId = await tenantIdAtual(supabase);
    const catalogo = await carregarCatalogoOrcamento();
    const faixas = calcularFaixas(catalogo.programas, catalogo.cambio);

    // Nao sobrescrever o que o admin fixou manualmente.
    const { data: manuais, error: erroManuais } = await supabase
      .from("faixa_preco")
      .select("nivel, destino, semanas")
      .eq("tenant_id", tenantId)
      .eq("origem", "manual");
    if (erroManuais) throw new Error(`Falha ao ler faixas manuais: ${erroManuais.message}`);
    const chaveManual = new Set((manuais ?? []).map((m: any) => `${m.nivel}|${m.destino}|${m.semanas}`));

    const agora = new Date().toISOString();
    const linhas = faixas
      .filter((f) => !chaveManual.has(`${f.nivel}|${f.destino}|${f.semanas}`))
      .map((f) => ({
        tenant_id: tenantId,
        nivel: f.nivel,
        destino: f.destino,
        pais: f.pais,
        semanas: f.semanas,
        moeda: f.moeda,
        p25: f.p25,
        mediana: f.mediana,
        p75: f.p75,
        p25_brl: f.p25Brl,
        mediana_brl: f.medianaBrl,
        p75_brl: f.p75Brl,
        amostra: f.amostra,
        inclui: f.inclui,
        origem: "derivado",
        data_cambio: catalogo.dataCambio,
        atualizado_em: agora,
      }));

    if (linhas.length > 0) {
      const { error } = await supabase
        .from("faixa_preco")
        .upsert(linhas, { onConflict: "tenant_id,nivel,destino,semanas" });
      if (error) throw new Error(`Falha ao gravar faixa_preco: ${error.message}`);
    }

    // Remove derivadas que ficaram sem amostra nesta rodada.
    const { data: existentes, error: erroExistentes } = await supabase
      .from("faixa_preco")
      .select("id, nivel, destino, semanas")
      .eq("tenant_id", tenantId)
      .eq("origem", "derivado");
    if (erroExistentes) throw new Error(`Falha ao ler faixas existentes: ${erroExistentes.message}`);
    const chaveAtual = new Set(linhas.map((l) => `${l.nivel}|${l.destino}|${l.semanas}`));
    const obsoletas = (existentes ?? [])
      .filter((e: any) => !chaveAtual.has(`${e.nivel}|${e.destino}|${e.semanas}`))
      .map((e: any) => e.id as string);
    if (obsoletas.length > 0) {
      const { error } = await supabase.from("faixa_preco").delete().in("id", obsoletas);
      if (error) throw new Error(`Falha ao apagar faixas obsoletas: ${error.message}`);
    }

    return NextResponse.json({
      ok: true,
      gravadas: linhas.length,
      manuaisPreservadas: chaveManual.size,
      removidas: obsoletas.length,
      programas: catalogo.programas.length,
      dataCambio: catalogo.dataCambio,
    });
  } catch (err) {
    console.error("[cron/atualizar-faixa-preco] erro:", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, erro: "Falha ao atualizar a faixa de preco." }, { status: 500 });
  }
}
