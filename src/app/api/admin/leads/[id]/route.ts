import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checarCapacidadeAdmin, usuarioAdminAtual } from "@/lib/admin-guard";
import { obterIp } from "@/lib/rate-limit";
import { barrarLeadForaDoEscopo } from "@/lib/admin-tenant";
import { atualizarStatusLead, LeadInvalido } from "@/lib/leads-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PATCH /api/admin/leads/[id] — move o status do lead no funil de captacao.
// Escrita comercial: exige propostas.gerir (Consultor/Gestor). A conversao em
// cliente (titular verificado) e uma rota propria — nao passa por aqui.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checarCapacidadeAdmin("propostas.gerir"))) {
    return NextResponse.json({ ok: false, erro: "Não autorizado" }, { status: 403 });
  }
  const { id } = await params;
  if (!id) return NextResponse.json({ ok: false, erro: "Lead inválido." }, { status: 400 });

  // Isolamento por tenant: lead de outro tenant -> 404 (lead.tenant_id direto).
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );
  const barrado = await barrarLeadForaDoEscopo(supabase, id);
  if (barrado) return barrado;

  const body = (await request.json().catch(() => null)) as { status?: unknown } | null;
  if (!body || typeof body.status !== "string") {
    return NextResponse.json({ ok: false, erro: "Informe o novo status." }, { status: 400 });
  }

  try {
    const r = await atualizarStatusLead({
      leadId: id,
      novoStatus: body.status,
      autor: (await usuarioAdminAtual()) ?? "admin",
      ip: obterIp(request),
    });
    return NextResponse.json({ ok: true, status: r.status });
  } catch (err) {
    if (err instanceof LeadInvalido) {
      const status = err.codigo.startsWith("falha_") ? 500 : err.codigo === "nao_encontrado" ? 404 : 400;
      return NextResponse.json({ ok: false, motivo: err.codigo, erro: err.message }, { status });
    }
    console.error("[admin/leads] erro ao atualizar status do lead");
    return NextResponse.json({ ok: false, erro: "Erro interno." }, { status: 500 });
  }
}
