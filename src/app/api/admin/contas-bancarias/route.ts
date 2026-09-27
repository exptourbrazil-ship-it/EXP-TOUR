import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checarCapacidadeAdmin, usuarioAdminAtual } from "@/lib/admin-guard";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";
import { obterIp } from "@/lib/rate-limit";
import { tenantIdAtual } from "@/lib/catalog-service";
import { listarPropostasBancariasPendentesAdmin, confirmarContaBancaria, rejeitarContaBancaria } from "@/lib/supplier-bank-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Fila central de propostas de conta bancaria (destino do repasse), de TODOS
// os fornecedores do tenant. Dado financeiro: mesma capacidade dos repasses
// (financeiro.ver para consultar, financeiro.gerir para confirmar/rejeitar).
// GET  -> lista as propostas pending_admin.
// POST -> confirma (vira a conta vigente) ou rejeita (motivo obrigatorio) uma
//         proposta. Auditado (ver supplier-bank-service.ts).
function getSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string);
}

export async function GET() {
  if (!(await checarCapacidadeAdmin("financeiro.ver"))) {
    return NextResponse.json({ ok: false, erro: "Não autorizado." }, { status: 403 });
  }
  const supabase = getSupabase();
  let tenantId: string;
  try {
    tenantId = await tenantIdAtual(supabase);
  } catch (err) {
    return NextResponse.json({ ok: false, erro: err instanceof Error ? err.message : "Falha ao resolver o tenant." }, { status: 500 });
  }
  const propostas = await listarPropostasBancariasPendentesAdmin(supabase, tenantId);
  return NextResponse.json({ ok: true, propostas });
}

export async function POST(request: Request) {
  // Confirmar/rejeitar move o destino do repasse: exige financeiro.gerir
  // (financeiro.ver so consulta). Falha fechada.
  if (!(await checarCapacidadeAdmin("financeiro.gerir"))) {
    return NextResponse.json({ ok: false, erro: "Não autorizado." }, { status: 403 });
  }
  const supabase = getSupabase();
  let tenantId: string;
  try {
    tenantId = await tenantIdAtual(supabase);
  } catch (err) {
    return NextResponse.json({ ok: false, erro: err instanceof Error ? err.message : "Falha ao resolver o tenant." }, { status: 500 });
  }
  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const acao = String(body?.acao || "");
  const id = typeof body?.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ ok: false, erro: "Proposta ausente." }, { status: 400 });

  const adminActor = (await usuarioAdminAtual()) ?? "sessao-expirada";
  const ip = obterIp(request);

  if (acao === "confirmar") {
    const r = await confirmarContaBancaria(supabase, { tenantId, adminActor, ip, id });
    if (!r.ok) return NextResponse.json({ ok: false, erro: r.erro }, { status: 400 });
    return NextResponse.json({ ok: true });
  }
  if (acao === "rejeitar") {
    const motivo = typeof body?.motivo === "string" ? body.motivo.trim() : "";
    if (!motivo) return NextResponse.json({ ok: false, erro: "Informe o motivo da recusa." }, { status: 400 });
    const r = await rejeitarContaBancaria(supabase, { tenantId, adminActor, ip, id, motivo });
    if (!r.ok) return NextResponse.json({ ok: false, erro: r.erro }, { status: 400 });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ ok: false, erro: "Ação inválida." }, { status: 400 });
}
