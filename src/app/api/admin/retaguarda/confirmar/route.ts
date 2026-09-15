import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checarCapacidadeAdmin, usuarioAdminAtual } from "@/lib/admin-guard";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";
import { resolverEscopoTenant } from "@/lib/cron-tenant";
import { obterIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Confirma (ack humano) a resolução de um achado ALTO da retaguarda. Um ALTO que
// some da detecção é resolvido com confirmado=false; um humano precisa confirmar
// que a inconsistência foi de fato tratada — assim uma "resolução" por edição dos
// campos observados não fecha o caso em silêncio (achado da revisão de segurança
// F7). A decisão que afeta o achado passa por pessoa (LGPD art. 20 / spec 7-F.2).
//
// Gate casos.gerir (ação operacional), escopo de tenant, auditado.
export async function POST(request: Request) {
  // Gate por SESSÃO (cookie), não por Bearer de env: o ack tem de ficar
  // atribuído a uma pessoa identificada. checarCapacidadeAdmin não aceita a via
  // Bearer de compatibilidade — assim `confirmado_por` é sempre um humano real.
  if (!(await checarCapacidadeAdmin("casos.gerir"))) {
    return NextResponse.json({ ok: false, error: "Nao autorizado" }, { status: 401 });
  }
  const usuario = await usuarioAdminAtual();
  if (!usuario) {
    return NextResponse.json({ ok: false, error: "Sessao sem usuario" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : null;
  if (!id) {
    return NextResponse.json({ ok: false, error: "id ausente" }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );

  // Escopo do tenant do deploy (fail-closed) — só confirma achado do próprio
  // tenant, mesmo que o id venha de outro.
  let tenantId: string;
  try {
    const escopo = await resolverEscopoTenant(supabase);
    tenantId = escopo.tenantId;
  } catch {
    return NextResponse.json({ ok: false, error: "Tenant nao resolvido" }, { status: 500 });
  }

  const agora = new Date().toISOString();

  // Confirma SOMENTE um achado deste tenant que esteja resolvido-aguardando
  // (status='resolvido' AND confirmado=false). Se já confirmado / aberto / de
  // outro tenant, o update não afeta linha nenhuma (404 no-op).
  const { data: atualizado, error } = await supabase
    .from("retaguarda_achado")
    .update({ confirmado: true, confirmado_por: usuario, confirmado_em: agora, updated_at: agora })
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .eq("status", "resolvido")
    .eq("confirmado", false)
    .select("id, chave, categoria, severidade")
    .maybeSingle();

  if (error) {
    console.error("[retaguarda/confirmar] falha ao confirmar:", error.message);
    return NextResponse.json({ ok: false, error: "Falha ao confirmar" }, { status: 500 });
  }
  if (!atualizado) {
    return NextResponse.json({ ok: false, error: "Achado nao encontrado ou ja confirmado" }, { status: 404 });
  }

  await registrarAuditoriaAdmin(supabase, {
    usuario,
    acao: "retaguarda.confirmar_resolucao",
    alvo: (atualizado as { chave?: string }).chave ?? id,
    detalhe: {
      id,
      categoria: (atualizado as { categoria?: string }).categoria,
      severidade: (atualizado as { severidade?: string }).severidade,
    },
    ip: obterIp(request),
  });

  return NextResponse.json({ ok: true });
}
