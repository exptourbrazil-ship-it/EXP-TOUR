import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checarCapacidadeAdmin, usuarioAdminAtual } from "@/lib/admin-guard";
import { obterIp } from "@/lib/rate-limit";
import { tenantIdAtual } from "@/lib/catalog-service";
import { aprovarPropostaPromocao, rejeitarPropostaPromocao } from "@/lib/promocao-proposta-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

// Aprovar (publica a promocao, com os ajustes do admin) ou recusar uma PROPOSTA DE
// PROMOCAO lida por IA (F3.3). Capacidade fornecedores.gerir (falha fechada). O
// service revalida posse (tenant/supplier/campus/alvo) e audita.
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
    const r = await aprovarPropostaPromocao(supabase, { tenantId, id, actor, ip, ajustes: body?.ajustes });
    if (!r.ok) return NextResponse.json({ ok: false, erro: r.erro, falhas: r.falhas ?? [] }, { status: 400 });
    return NextResponse.json({ ok: true, promotionId: r.promotionId, nome: r.nome });
  }
  if (acao === "rejeitar") {
    const motivo = typeof body?.motivo === "string" ? body.motivo.trim() : "";
    if (!motivo) return NextResponse.json({ ok: false, erro: "Informe o motivo da recusa." }, { status: 400 });
    const r = await rejeitarPropostaPromocao(supabase, { tenantId, id, actor, ip, motivo });
    if (!r.ok) return NextResponse.json({ ok: false, erro: r.erro }, { status: 400 });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ ok: false, erro: "Ação inválida." }, { status: 400 });
}
