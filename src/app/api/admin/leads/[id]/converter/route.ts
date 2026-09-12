import { NextResponse } from "next/server";
import { checarCapacidadeAdmin, usuarioAdminAtual } from "@/lib/admin-guard";
import { obterIp } from "@/lib/rate-limit";
import { converterLeadEmCotacao, LeadConversaoInvalida } from "@/lib/lead-conversao-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/leads/[id]/converter — cria uma COTAÇÃO em rascunho a partir do
// lead (aluno + programa escolhido) e a vincula. Escrita comercial: exige
// propostas.gerir (Consultor/Gestor). NÃO cria conta login-capável (isso é o
// aceite no portal, num contexto verificado).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checarCapacidadeAdmin("propostas.gerir"))) {
    return NextResponse.json({ ok: false, erro: "Não autorizado" }, { status: 403 });
  }
  const { id } = await params;
  if (!id) return NextResponse.json({ ok: false, erro: "Lead inválido." }, { status: 400 });

  try {
    const r = await converterLeadEmCotacao({
      leadId: id,
      actorEmail: (await usuarioAdminAtual()) ?? "admin",
      ip: obterIp(request),
    });
    return NextResponse.json({ ok: true, quoteId: r.quoteId, jaExistia: r.jaExistia, itemAdicionado: r.itemAdicionado, aviso: r.aviso ?? null });
  } catch (err) {
    if (err instanceof LeadConversaoInvalida) {
      const status = err.codigo.startsWith("falha_") ? 500 : err.codigo === "nao_encontrado" ? 404 : 400;
      return NextResponse.json({ ok: false, motivo: err.codigo, erro: err.message }, { status });
    }
    console.error("[admin/leads/converter] erro ao converter lead em cotacao");
    return NextResponse.json({ ok: false, erro: "Erro interno ao converter o lead." }, { status: 500 });
  }
}
