import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { verificarSessao, SESSION_COOKIE } from "@/lib/session";
import { obterIp } from "@/lib/rate-limit";
import { aceitarAcerto, AcertoBloqueado } from "@/lib/acerto-service";
import { titularPodeCliente } from "@/lib/perfil-service";

export const runtime = "nodejs";

// CLIENTE: aceita eletronicamente um acerto proposto (proposto -> aceito). A
// prova (hash/ip/ua) vai para `aceites`; NAO move dinheiro (a execucao do refund
// e um marco proprio). So o titular dono do contrato pode aceitar.
export async function POST(request: Request) {
  const cookieStore = await cookies();
  const sessao = verificarSessao(cookieStore.get(SESSION_COOKIE)?.value);
  if (!sessao) {
    return NextResponse.json({ ok: false, error: "Nao autenticado" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const acertoId = String(body?.acertoId || "");
  if (!acertoId) {
    return NextResponse.json({ ok: false, error: "Informe acertoId" }, { status: 400 });
  }

  // Bloqueio por PERFIL (5.4.4 + LGPD): aceitar acerto é ato financeiro do
  // contratante. (aceitarAcerto revalida a posse do contrato pelo titularId.)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );
  if (!(await titularPodeCliente(supabase, sessao.titularId, "pagamento.gerir"))) {
    return NextResponse.json({ ok: false, error: "Seu perfil não permite aceitar o acerto." }, { status: 403 });
  }

  try {
    const r = await aceitarAcerto({
      acertoId,
      titularId: sessao.titularId,
      ip: obterIp(request),
      userAgent: request.headers.get("user-agent"),
    });
    return NextResponse.json(r);
  } catch (err) {
    if (err instanceof AcertoBloqueado) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 400 });
    }
    console.error("[acerto-aceitar] falha ao registrar o aceite");
    return NextResponse.json({ ok: false, error: "Falha ao registrar o aceite" }, { status: 500 });
  }
}
