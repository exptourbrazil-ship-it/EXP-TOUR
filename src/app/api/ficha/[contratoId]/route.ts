import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { verificarSessao, SESSION_COOKIE } from "@/lib/session";
import { obterIp } from "@/lib/rate-limit";
import { carregarFicha, assinarFicha } from "@/lib/ficha-matricula-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function supa() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );
}

async function titularDaSessao(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const s = verificarSessao(token);
  return s?.titularId ?? null;
}

function sessionIdSeguro(v: unknown): string {
  if (typeof v === "string") {
    const limpo = v.trim().replace(/[^A-Za-z0-9._-]/g, "").slice(0, 128);
    if (limpo.length >= 8) return limpo;
  }
  return randomUUID();
}

// GET: estado da ficha do contrato (posse por titular da sessao).
export async function GET(_req: Request, { params }: { params: Promise<{ contratoId: string }> }) {
  const titularId = await titularDaSessao();
  if (!titularId) return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
  const { contratoId } = await params;
  const ficha = await carregarFicha(supa(), titularId, contratoId);
  if (!ficha) return NextResponse.json({ ok: false, error: "Ficha não encontrada" }, { status: 404 });
  return NextResponse.json({ ok: true, ficha });
}

// POST: assina a ficha (marcacao eletronica). Body: { papel, nome?,
// processamentoImediato: boolean, sessionId? }.
export async function POST(request: Request, { params }: { params: Promise<{ contratoId: string }> }) {
  const titularId = await titularDaSessao();
  if (!titularId) return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
  const { contratoId } = await params;

  const b = (await request.json().catch(() => ({}))) ?? {};
  if (b.papel !== "participante" && b.papel !== "responsavel") {
    return NextResponse.json({ ok: false, error: "Informe o papel do signatário." }, { status: 400 });
  }
  if (typeof b.processamentoImediato !== "boolean") {
    return NextResponse.json({ ok: false, error: "Informe processamentoImediato (boolean)." }, { status: 400 });
  }

  const res = await assinarFicha(
    supa(),
    titularId,
    contratoId,
    {
      papel: b.papel,
      nome: typeof b.nome === "string" ? b.nome : null,
      processamentoImediato: b.processamentoImediato,
    },
    { ip: obterIp(request), userAgent: request.headers.get("user-agent"), sessionId: sessionIdSeguro(b.sessionId) },
  );
  if (!res.ok) return NextResponse.json({ ok: false, error: res.erro }, { status: res.status });
  return NextResponse.json({ ok: true, completa: res.completa });
}
