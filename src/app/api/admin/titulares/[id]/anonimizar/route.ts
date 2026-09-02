import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checarCapacidadeAdmin, usuarioAdminAtual } from "@/lib/admin-guard";
import { anonimizarTitular, AnonimizacaoBloqueada } from "@/lib/anonimizacao-service";
import { obterIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

// Anonimizacao de dados do titular (LGPD art. 18) — IRREVERSIVEL. Autorizacao por
// SESSAO com config.gerir (so Gestor, checarCapacidadeAdmin, SEM Bearer) e admin
// IDENTIFICADO. O titularId vem da URL (server), nunca do corpo. Exige justificativa.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checarCapacidadeAdmin("config.gerir"))) {
    return NextResponse.json({ ok: false, erro: "Não autorizado" }, { status: 401 });
  }
  const autor = await usuarioAdminAtual();
  if (!autor) {
    return NextResponse.json({ ok: false, erro: "Sessão admin não identificada" }, { status: 401 });
  }
  const { id: titularId } = await params;
  const body = (await request.json().catch(() => ({}))) ?? {};
  const justificativa = typeof body?.justificativa === "string" ? body.justificativa : "";
  // Trilha LGPD: exige uma justificativa minimamente descritiva (>= 5 caracteres),
  // nao so um caractere qualquer.
  if (justificativa.trim().length < 5) {
    return NextResponse.json(
      { ok: false, erro: "Informe uma justificativa descritiva para a anonimização (mín. 5 caracteres)." },
      { status: 400 },
    );
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );

  try {
    const r = await anonimizarTitular({
      supabase,
      titularId,
      autor,
      justificativa,
      ip: obterIp(request),
    });
    return NextResponse.json({ ok: true, documentosRemovidos: r.documentosRemovidos, storagePendentes: r.storagePendentes });
  } catch (err) {
    if (err instanceof AnonimizacaoBloqueada) {
      const status = err.codigo === "titular_nao_encontrado" ? 404 : 400;
      return NextResponse.json({ ok: false, motivo: err.codigo, erro: mensagem(err.codigo) }, { status });
    }
    return NextResponse.json({ ok: false, erro: "Falha ao anonimizar." }, { status: 500 });
  }
}

function mensagem(codigo: string): string {
  switch (codigo) {
    case "contrato_ativo":
      return "Há contrato ativo (não encerrado). A anonimização só é permitida após todos os contratos concluídos ou cancelados.";
    case "ja_anonimizado":
      return "Os dados deste titular já foram anonimizados.";
    case "justificativa_obrigatoria":
      return "Informe a justificativa da anonimização.";
    case "titular_nao_encontrado":
      return "Titular não encontrado.";
    default:
      return "Não foi possível concluir a anonimização.";
  }
}
