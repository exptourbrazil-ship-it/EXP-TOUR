import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checarCapacidadeAdmin, usuarioAdminAtual } from "@/lib/admin-guard";
import { obterIp } from "@/lib/rate-limit";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";
import { aplicarEdicaoParcelas, ParcelaEditErro } from "@/lib/parcelas-edit-service";
import type { ParcelaEditInput } from "@/lib/parcelas-edit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PUT /api/admin/contratos/[id]/parcelas — o Admin edita as parcelas de um
// contrato de cliente (Caso 360). Mexe em dinheiro: exige capacidade
// financeiro.gerir (Financeiro ou Gestor). Mesmas invariantes do self-service do
// cliente (serviço compartilhado): parcela paga/Pix é imutável (pass-through) e
// não trava o ajuste das demais; a soma confere; regra dos 30 dias. Auditado.
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checarCapacidadeAdmin("financeiro.gerir"))) {
    return NextResponse.json({ ok: false, erro: "Não autorizado" }, { status: 401 });
  }

  const { id: contratoId } = await params;
  if (!contratoId) {
    return NextResponse.json({ ok: false, erro: "Contrato inválido." }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parcelas = Array.isArray((body as { parcelas?: unknown } | null)?.parcelas)
    ? ((body as { parcelas: ParcelaEditInput[] }).parcelas)
    : null;
  if (!parcelas) {
    return NextResponse.json({ ok: false, erro: "Corpo inválido: informe 'parcelas'." }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );

  try {
    const r = await aplicarEdicaoParcelas(supabase, { contratoId, parcelas });
    await registrarAuditoriaAdmin(supabase, {
      usuario: (await usuarioAdminAtual()) ?? "admin",
      acao: "contrato.parcelas.editar",
      alvo: contratoId,
      detalhe: { total: r.total, removidas: r.removidas, travadas_mantidas: r.travadas },
      ip: obterIp(request),
    });
    return NextResponse.json(r);
  } catch (err) {
    if (err instanceof ParcelaEditErro) {
      return NextResponse.json({ ok: false, erro: err.mensagem }, { status: err.status });
    }
    console.error("[admin/contratos/parcelas] erro inesperado:", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, erro: "Erro interno ao salvar as parcelas." }, { status: 500 });
  }
}
