import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verificarSessao, SESSION_COOKIE } from "@/lib/session";
import { obterIp } from "@/lib/rate-limit";
import { aceitarAcerto, AcertoBloqueado } from "@/lib/acerto-service";

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
