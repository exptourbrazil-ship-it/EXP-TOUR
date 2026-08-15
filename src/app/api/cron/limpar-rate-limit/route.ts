import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { calcularCorteRetencaoISO } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Limpeza da tabela rate_limit_hits (Vercel Cron, ver vercel.json).
//
// A tabela rate_limit_hits so cresce: cada tentativa (ex.: pedido de codigo de
// acesso) grava uma linha. Como a janela de rate-limit e de minutos, linhas
// antigas nao tem mais utilidade. Uma vez por dia apagamos os hits mais velhos
// que RATE_LIMIT_RETENCAO_HORAS (padrao 24h), mantendo a tabela enxuta.
//
// Autenticacao: Bearer CRON_SECRET (mesmo padrao dos demais crons).

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  // Falha FECHADO. Antes era `if (cronSecret && ...)`: se a variavel sumisse,
  // fosse renomeada ou ficasse vazia, a guarda era pulada e a rota virava
  // publica, sem nenhum sinal. Configuracao faltante agora recusa.
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

  const retencaoHoras = Number(process.env.RATE_LIMIT_RETENCAO_HORAS || "24");
  const corteISO = calcularCorteRetencaoISO(Date.now(), retencaoHoras);

  // Apaga e pede a contagem das linhas afetadas (head+count) para o relatorio.
  const { error, count } = await supabase
    .from("rate_limit_hits")
    .delete({ count: "exact" })
    .lt("criado_em", corteISO);

  if (error) {
    return NextResponse.json({ ok: false, erro: "Falha na limpeza: " + error.message }, { status: 500 });
  }

  // Expurgo dos codigos de acesso. A tabela nunca era limpa: guardava todo
  // codigo ja emitido, indefinidamente. Agora os codigos sao gravados como
  // HMAC, mas mesmo hash nao precisa ficar para sempre — um codigo expira em
  // 10 minutos, entao nada com mais de 24h tem utilidade.
  const { error: errCodigos, count: codigosRemovidos } = await supabase
    .from("codigos_acesso")
    .delete({ count: "exact" })
    .lt("created_at", corteISO);

  if (errCodigos) {
    // Nao derruba a rota: a limpeza do rate limit ja foi feita e e a critica.
    console.error("[limpar-rate-limit] falha ao expurgar codigos_acesso:", errCodigos.message);
  }

  return NextResponse.json({
    ok: true,
    corte: corteISO,
    removidos: count ?? 0,
    codigos_removidos: errCodigos ? null : (codigosRemovidos ?? 0),
  });
}
