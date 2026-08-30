import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checarCapacidadeRequest, usuarioAdminAtual } from "@/lib/admin-guard";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";
import { carregarReembolsoContrato, definirEtapaAnexoI } from "@/lib/reembolso-service";
import { etapaValida } from "@/lib/etapa-anexo-i";
import { obterIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function supa() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );
}

// GET: calcula o reembolso do Anexo I para o contrato (what-if via query:
// ?naoRecuperaveis=&etapa=&dispensa=). Gateado por cancelamento.gerir (RBAC).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checarCapacidadeRequest(request, "cancelamento.gerir"))) {
    return NextResponse.json({ ok: false, error: "Não autorizado" }, { status: 401 });
  }
  const { id } = await params;
  const url = new URL(request.url);
  const naoRecuperaveis = Number(url.searchParams.get("naoRecuperaveis") || "0");
  const etapa = url.searchParams.get("etapa");
  const dispensa = url.searchParams.get("dispensa") === "true";

  const dados = await carregarReembolsoContrato(supa(), id, {
    naoRecuperaveis: Number.isFinite(naoRecuperaveis) ? naoRecuperaveis : 0,
    etapaOverrideEntrada: etapa,
    dispensa,
  });
  if (!dados) return NextResponse.json({ ok: false, error: "Contrato não encontrado" }, { status: 404 });
  return NextResponse.json({ ok: true, dados });
}

// POST: grava (ou limpa) o override da etapa concluida. Body: { etapa: string|null }.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checarCapacidadeRequest(request, "cancelamento.gerir"))) {
    return NextResponse.json({ ok: false, error: "Não autorizado" }, { status: 401 });
  }
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) ?? {};
  const etapa = body.etapa === null ? null : typeof body.etapa === "string" ? body.etapa : undefined;
  if (etapa === undefined) {
    return NextResponse.json({ ok: false, error: "Informe a etapa (ou null para derivar)." }, { status: 400 });
  }
  // Valida a etapa ANTES de tocar o banco (400 != 404): assim um valor invalido e
  // um contrato inexistente devolvem status distintos.
  if (etapa !== null && !etapaValida(etapa)) {
    return NextResponse.json({ ok: false, error: "Etapa inválida." }, { status: 400 });
  }
  const supabase = supa();
  const ok = await definirEtapaAnexoI(supabase, id, etapa);
  if (!ok) return NextResponse.json({ ok: false, error: "Contrato não encontrado." }, { status: 404 });

  const usuario = (await usuarioAdminAtual()) ?? "bearer-secret";
  await registrarAuditoriaAdmin(supabase, {
    usuario,
    acao: "reembolso.etapa_definida",
    alvo: id,
    detalhe: { etapa },
    ip: obterIp(request),
  });
  return NextResponse.json({ ok: true });
}
