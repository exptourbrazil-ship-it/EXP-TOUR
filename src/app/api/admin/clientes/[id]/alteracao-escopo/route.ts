import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checarCapacidadeAdmin, usuarioAdminAtual } from "@/lib/admin-guard";
import { obterIp } from "@/lib/rate-limit";
import { calcularERegistrarAlteracaoEscopo, AlteracaoBloqueada } from "@/lib/alteracao-service";
import { barrarTitularForaDoEscopo } from "@/lib/admin-tenant";

export const runtime = "nodejs";

// Calcula e grava (rascunho) a PREVIA do delta financeiro e do plano recalculado
// na alteracao de escopo (E3) de um contrato do titular [id]. O novo valor do
// programa e informado pela Operacao/Financeiro (nao ha motor de preco). NAO
// cobra, NAO devolve e NAO reescreve parcelas (aditivo/refund = marcos proprios,
// dinheiro so muda por webhook). Autorizacao por capacidade financeiro.gerir: o
// E3 apura delta em dinheiro e eventual credito a devolver. Requer um E3 ATIVO.
// Exige SESSAO com RBAC. NAO aceita o fallback Bearer ADMIN_CAMBIO_SECRET:
// esse segredo existe para cambio/cron e daria a qualquer portador o poder de
// mexer em acerto, cancelamento e aditivo de contrato — dinheiro de cliente —
// com a trilha atribuindo tudo a "bearer-secret". O caminho Bearer tambem nao
// tem e-mail de sessao e por isso vira super-admin GLOBAL (admin-tenant.ts),
// atravessando as duas marcas. So as telas do admin chamam estas rotas.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checarCapacidadeAdmin("financeiro.gerir"))) {
    return NextResponse.json({ ok: false, error: "Nao autorizado" }, { status: 403 });
  }

  const { id: titularId } = await params;
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );
  const barrado = await barrarTitularForaDoEscopo(supabase, titularId);
  if (barrado) return barrado;

  const body = await request.json().catch(() => null);
  const contratoId = String(body?.contratoId || "");
  const valorProgramaNovo =
    body?.valorProgramaNovo != null && Number.isFinite(Number(body.valorProgramaNovo))
      ? Number(body.valorProgramaNovo)
      : null;

  if (!contratoId) {
    return NextResponse.json({ ok: false, error: "Informe contratoId" }, { status: 400 });
  }
  if (valorProgramaNovo == null) {
    return NextResponse.json({ ok: false, error: "Informe o novo valor do programa" }, { status: 400 });
  }

  const autor = (await usuarioAdminAtual()) ?? "sessao-expirada";
  try {
    const alteracao = await calcularERegistrarAlteracaoEscopo({
      contratoId,
      titularIdEsperado: titularId,
      valorProgramaNovo,
      autor,
      ip: obterIp(request),
    });
    return NextResponse.json({ ok: true, alteracao });
  } catch (err) {
    if (err instanceof AlteracaoBloqueada) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 400 });
    }
    console.error("[alteracao-escopo] falha ao calcular o plano");
    return NextResponse.json({ ok: false, error: "Falha ao calcular o plano" }, { status: 500 });
  }
}
