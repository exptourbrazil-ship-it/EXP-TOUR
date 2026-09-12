import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checarCapacidadeRequest, usuarioAdminAtual } from "@/lib/admin-guard";
import { obterIp } from "@/lib/rate-limit";
import { tenantIdAtual } from "@/lib/catalog-service";
import { aprovarConteudoPeloAdmin, rejeitarConteudoPeloAdmin } from "@/lib/content-admin-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Aprovação/rejeição do CONTEÚDO de programa proposto pela escola (Fase B1).
// Capacidade fornecedores.gerir (falha fechada). Aprovar MATERIALIZA o payload
// em product_content / product_media / program_detail (auditoria no serviço).
export async function POST(request: Request) {
  if (!(await checarCapacidadeRequest(request, "fornecedores.gerir"))) {
    return NextResponse.json({ ok: false, erro: "Não autorizado" }, { status: 403 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );

  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const acao = String(body?.acao || "");
  const id = String(body?.id || "");
  if (!id) return NextResponse.json({ ok: false, erro: "Conteúdo ausente." }, { status: 400 });

  let tenantId: string;
  try {
    tenantId = await tenantIdAtual(supabase);
  } catch (err) {
    return NextResponse.json({ ok: false, erro: err instanceof Error ? err.message : "Falha ao resolver o tenant." }, { status: 500 });
  }
  const adminUser = (await usuarioAdminAtual()) ?? "bearer-secret";
  const ip = obterIp(request);

  if (acao === "aprovar") {
    const r = await aprovarConteudoPeloAdmin(supabase, tenantId, id, adminUser, ip);
    return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ ok: false, erro: r.erro }, { status: 400 });
  }
  if (acao === "rejeitar") {
    const motivo = typeof body?.motivo === "string" ? body.motivo.trim() : "";
    if (!motivo) return NextResponse.json({ ok: false, erro: "Informe o motivo do ajuste." }, { status: 400 });
    const r = await rejeitarConteudoPeloAdmin(supabase, tenantId, id, adminUser, motivo, ip);
    return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ ok: false, erro: r.erro }, { status: 400 });
  }
  return NextResponse.json({ ok: false, erro: "Ação inválida." }, { status: 400 });
}
