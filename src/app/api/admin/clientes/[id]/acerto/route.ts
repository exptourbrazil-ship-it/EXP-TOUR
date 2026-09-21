import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checarCapacidadeAdmin, usuarioAdminAtual } from "@/lib/admin-guard";
import { obterIp } from "@/lib/rate-limit";
import { calcularERegistrarAcerto, AcertoBloqueado } from "@/lib/acerto-service";
import { barrarTitularForaDoEscopo } from "@/lib/admin-tenant";

export const runtime = "nodejs";

// Calcula e grava (rascunho) o acerto de cancelamento de um contrato do titular
// [id] — retencao/multa, saldo a devolver e memoria de calculo, para o Financeiro
// revisar. NAO propoe ao cliente, NAO coleta aceite, NAO executa refund (marcos
// proprios). Autorizacao por capacidade financeiro.gerir (o acerto e do
// Financeiro). Requer uma excecao de cancelamento ATIVA no contrato.
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
  const refundEscolaEsperado =
    body?.refundEscolaEsperado != null && Number.isFinite(Number(body.refundEscolaEsperado))
      ? Number(body.refundEscolaEsperado)
      : null;

  if (!contratoId) {
    return NextResponse.json({ ok: false, error: "Informe contratoId" }, { status: 400 });
  }

  const autor = (await usuarioAdminAtual()) ?? "sessao-expirada";
  try {
    const acerto = await calcularERegistrarAcerto({
      contratoId,
      titularIdEsperado: titularId,
      refundEscolaEsperado,
      autor,
      ip: obterIp(request),
    });
    return NextResponse.json({ ok: true, acerto });
  } catch (err) {
    if (err instanceof AcertoBloqueado) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 400 });
    }
    console.error("[acerto] falha ao calcular o acerto");
    return NextResponse.json({ ok: false, error: "Falha ao calcular o acerto" }, { status: 500 });
  }
}
