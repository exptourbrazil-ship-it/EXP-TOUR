import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checarCapacidadeRequest, usuarioAdminAtual } from "@/lib/admin-guard";
import { obterIp } from "@/lib/rate-limit";
import { tenantIdAtual } from "@/lib/catalog-service";
import { salvarConfigMarca } from "@/lib/tenant-config-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/config/sobre-nos — salva o institucional "Sobre nós" + contato
// do tenant (exibido na aba "Sobre nós" da cotação). Capacidade config.gerir
// (falha fechada), só Gestor.
export async function POST(request: Request) {
  if (!(await checarCapacidadeRequest(request, "config.gerir"))) {
    return NextResponse.json({ ok: false, erro: "Não autorizado" }, { status: 403 });
  }
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );
  const body = await request.json().catch(() => ({} as Record<string, unknown>));

  let tenantId: string;
  try {
    tenantId = await tenantIdAtual(supabase);
  } catch (err) {
    return NextResponse.json({ ok: false, erro: err instanceof Error ? err.message : "Falha ao resolver o tenant." }, { status: 500 });
  }

  const r = await salvarConfigMarca(
    supabase,
    tenantId,
    { aboutUsHtml: body?.aboutUsHtml, website: body?.website, address: body?.address, email: body?.email, phone: body?.phone },
    (await usuarioAdminAtual()) ?? "admin",
    obterIp(request),
  );
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ ok: false, erro: r.erro }, { status: 400 });
}
