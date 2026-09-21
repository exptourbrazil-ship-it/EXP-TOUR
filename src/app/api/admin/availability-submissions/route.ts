import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checarCapacidadeAdmin, usuarioAdminAtual } from "@/lib/admin-guard";
import { obterIp } from "@/lib/rate-limit";
import { tenantIdAtual } from "@/lib/catalog-service";
import { aprovarPropostaDisponibilidade, rejeitarPropostaDisponibilidade } from "@/lib/disponibilidade-proposta-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Publicacao item a item (2-3 roundtrips cada, ate MAX_ITENS_PLANO); checkpoint a cada 25.
export const maxDuration = 60;

const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

// Publicar os itens escolhidos (ou recusar) de uma PROPOSTA DE DISPONIBILIDADE lida
// por IA (F3.4). Capacidade fornecedores.gerir (falha fechada); o service revalida a
// posse item a item (salvarIntake/salvarPeriodo) e audita.
// Exige SESSAO com RBAC. NAO aceita o fallback Bearer ADMIN_CAMBIO_SECRET:
// esse segredo existe para cambio/cron. O caminho Bearer nao tem e-mail de
// sessao, entao a trilha atribui tudo a "bearer-secret" e o escopoTenantAdmin
// o promove a super-admin GLOBAL, atravessando as duas marcas. So as telas do
// admin chamam esta rota, por cookie.
export async function POST(request: Request) {
  if (!(await checarCapacidadeAdmin("fornecedores.gerir"))) {
    return NextResponse.json({ ok: false, erro: "Nao autorizado" }, { status: 403 });
  }
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string);
  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const acao = String(body?.acao || "");
  const id = body?.id;
  if (!isUuid(id)) return NextResponse.json({ ok: false, erro: "Proposta ausente." }, { status: 400 });
  let tenantId: string;
  try {
    tenantId = await tenantIdAtual(supabase);
  } catch (err) {
    return NextResponse.json({ ok: false, erro: err instanceof Error ? err.message : "Falha ao resolver o tenant." }, { status: 500 });
  }
  const actor = (await usuarioAdminAtual()) ?? "sessao-expirada";
  const ip = obterIp(request);

  if (acao === "aprovar") {
    const r = await aprovarPropostaDisponibilidade(supabase, { tenantId, id, actor, ip, chaves: body?.chaves });
    if (!r.ok) return NextResponse.json({ ok: false, erro: r.erro }, { status: 400 });
    return NextResponse.json({ ok: true, aplicados: r.aplicados, falhas: r.falhas });
  }
  if (acao === "rejeitar") {
    const motivo = typeof body?.motivo === "string" ? body.motivo.trim() : "";
    if (!motivo) return NextResponse.json({ ok: false, erro: "Informe o motivo da recusa." }, { status: 400 });
    const r = await rejeitarPropostaDisponibilidade(supabase, { tenantId, id, actor, ip, motivo });
    if (!r.ok) return NextResponse.json({ ok: false, erro: r.erro }, { status: 400 });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ ok: false, erro: "Ação inválida." }, { status: 400 });
}
