import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checarCapacidadeAdmin } from "@/lib/admin-guard";
import { carregarReembolsoUnificado } from "@/lib/reembolso-service";
import { escopoTenantAdmin, escopoPermiteContrato, tenantDoContrato } from "@/lib/admin-tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Exige SESSAO com RBAC. NAO aceita o fallback Bearer ADMIN_CAMBIO_SECRET:
// esse segredo existe para cambio/cron e daria a qualquer portador o poder de
// mexer em DINHEIRO de cliente, com a trilha registrando so "bearer-secret",
// sem pessoa. So a tela do admin chama esta rota, por cookie.

function supa() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );
}

// GET: PRÉVIA (read-only) do reembolso UNIFICADO — retenção EXP Tour (Anexo I) +
// fornecedor (escada por campus) + câmbio, numa memória única. Não persiste nem
// move dinheiro. What-if via query: ?naoRecuperaveis=&remuneracaoServicos=&data=.
// Gateado por cancelamento.gerir (RBAC) + escopo de tenant (banco compartilhado).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checarCapacidadeAdmin("cancelamento.gerir"))) {
    return NextResponse.json({ ok: false, error: "Não autorizado" }, { status: 403 });
  }
  const { id } = await params;
  const supabase = supa();

  // Isolamento por tenant: contrato de outro tenant (ou inexistente) -> 404.
  const escopo = await escopoTenantAdmin(supabase);
  if (!escopo.global) {
    const { existe, tenantId } = await tenantDoContrato(supabase, id);
    if (!existe || !escopoPermiteContrato(escopo, tenantId)) {
      return NextResponse.json({ ok: false, error: "Contrato não encontrado" }, { status: 404 });
    }
  }

  const url = new URL(request.url);
  const naoRecuperaveis = Number(url.searchParams.get("naoRecuperaveis") || "0");
  const remuneracaoServicos = Number(url.searchParams.get("remuneracaoServicos") || "0");
  const data = url.searchParams.get("data");

  const dados = await carregarReembolsoUnificado(supabase, id, {
    naoRecuperaveis: Number.isFinite(naoRecuperaveis) ? naoRecuperaveis : 0,
    remuneracaoServicos: Number.isFinite(remuneracaoServicos) ? remuneracaoServicos : 0,
    dataCancelamentoISO: data || undefined,
  });
  if (!dados) return NextResponse.json({ ok: false, error: "Contrato não encontrado" }, { status: 404 });
  return NextResponse.json({ ok: true, dados });
}
