import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checarCapacidadeAdmin, usuarioAdminAtual } from "@/lib/admin-guard";
import { obterIp } from "@/lib/rate-limit";
import { proporAcerto, AcertoBloqueado } from "@/lib/acerto-service";
import { barrarTitularForaDoEscopo } from "@/lib/admin-tenant";

export const runtime = "nodejs";

// Propoe ao cliente um acerto em rascunho (rascunho -> proposto): renderiza o
// Termo de Acerto (texto + hash) e o expoe na Area do Cliente para aceite
// eletronico. NAO move dinheiro. Autorizacao por financeiro.gerir; posse pelo
// id do path.
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
  const acertoId = String(body?.acertoId || "");
  if (!acertoId) {
    return NextResponse.json({ ok: false, error: "Informe acertoId" }, { status: 400 });
  }

  const autor = (await usuarioAdminAtual()) ?? "sessao-expirada";
  try {
    const acerto = await proporAcerto({ acertoId, titularIdEsperado: titularId, autor, ip: obterIp(request) });
    return NextResponse.json({ ok: true, acerto });
  } catch (err) {
    if (err instanceof AcertoBloqueado) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 400 });
    }
    console.error("[acerto-propor] falha ao propor o acerto");
    return NextResponse.json({ ok: false, error: "Falha ao propor o acerto" }, { status: 500 });
  }
}
