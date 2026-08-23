import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verificarSessao, SESSION_COOKIE } from "@/lib/session";
import { obterIp } from "@/lib/rate-limit";
import { aceitarAditivo, AlteracaoBloqueada } from "@/lib/alteracao-service";

export const runtime = "nodejs";

// CLIENTE: aceita eletronicamente o ADITIVO DE COMPRA de um E3 (delta>0). A
// prova (hash/ip/ua) vai para `aceites`; NAO cobra (o delta e cobrado pela
// cascata). So o titular dono do contrato pode aceitar.
export async function POST(request: Request) {
  const cookieStore = await cookies();
  const sessao = verificarSessao(cookieStore.get(SESSION_COOKIE)?.value);
  if (!sessao) {
    return NextResponse.json({ ok: false, error: "Nao autenticado" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const alteracaoId = String(body?.alteracaoId || "");
  if (!alteracaoId) {
    return NextResponse.json({ ok: false, error: "Informe alteracaoId" }, { status: 400 });
  }

  try {
    const r = await aceitarAditivo({
      alteracaoId,
      titularId: sessao.titularId,
      ip: obterIp(request),
      userAgent: request.headers.get("user-agent"),
    });
    return NextResponse.json(r);
  } catch (err) {
    if (err instanceof AlteracaoBloqueada) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 400 });
    }
    console.error("[aditivo-aceitar] falha ao registrar o aceite");
    return NextResponse.json({ ok: false, error: "Falha ao registrar o aceite" }, { status: 500 });
  }
}
