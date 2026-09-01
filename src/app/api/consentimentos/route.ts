import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { verificarSessao, SESSION_COOKIE } from "@/lib/session";
import { registrarConsentimento, ConsentimentoInvalido } from "@/lib/consentimento-service";
import { obterIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

// Registra um ato de consentimento do PROPRIO titular (LGPD, Clausulas 15/16).
// Conceder ou revogar sempre INSEREM uma linha no ledger. Posse: o titularId vem
// da sessao (nunca do corpo). O IP e gravado como prova do ato.
export async function POST(request: Request) {
  const cookieStore = await cookies();
  const sessao = verificarSessao(cookieStore.get(SESSION_COOKIE)?.value);
  if (!sessao) {
    return NextResponse.json({ ok: false, erro: "Sessão não autenticada" }, { status: 401 });
  }

  let corpo: { tipo?: string; concedido?: boolean };
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ ok: false, erro: "Corpo inválido" }, { status: 400 });
  }
  const tipo = typeof corpo.tipo === "string" ? corpo.tipo : "";
  if (!tipo || typeof corpo.concedido !== "boolean") {
    return NextResponse.json({ ok: false, erro: "Informe 'tipo' e 'concedido' (booleano)." }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );

  try {
    const estado = await registrarConsentimento({
      supabase,
      titularId: sessao.titularId,
      tipo,
      concedido: corpo.concedido,
      ip: obterIp(request),
      origem: "portal",
      autor: "cliente",
    });
    return NextResponse.json({ ok: true, estado });
  } catch (err) {
    if (err instanceof ConsentimentoInvalido) {
      const status = err.codigo === "tipo_invalido" || err.codigo === "nao_revogavel" ? 400 : 500;
      return NextResponse.json({ ok: false, motivo: err.codigo }, { status });
    }
    return NextResponse.json({ ok: false, erro: "Falha ao registrar o consentimento." }, { status: 500 });
  }
}
