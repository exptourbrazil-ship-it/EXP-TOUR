import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checarCapacidadeAdmin, usuarioAdminAtual } from "@/lib/admin-guard";
import { barrarTitularForaDoEscopo } from "@/lib/admin-tenant";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";
import { obterIp } from "@/lib/rate-limit";
import { perfilValido } from "@/lib/perfil-acesso";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Define o PERFIL de acesso do titular [id] (contratante | participante |
// terceiro_pagador). É o controle que ATIVA o bloqueio financeiro (5.4.4 +
// LGPD): marcar "participante" faz o portal esconder/negar todo o financeiro na
// hora (o enforcement lê o perfil vigente do banco a cada requisição).
// Capacidade casos.gerir + escopo de tenant. Auditado.
// Exige SESSAO com RBAC. NAO aceita o fallback Bearer ADMIN_CAMBIO_SECRET:
// esse segredo existe para cambio/cron. O caminho Bearer nao tem e-mail de
// sessao, entao a trilha atribui tudo a "bearer-secret" e o escopoTenantAdmin
// o promove a super-admin GLOBAL, atravessando as duas marcas. So as telas do
// admin chamam esta rota, por cookie.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: titularId } = await params;
  // Controle de ACESSO/privacidade (quem vê dinheiro): exige a capacidade forte
  // config.gerir (mesma da anonimização LGPD), não a operacional casos.gerir.
  if (!(await checarCapacidadeAdmin("config.gerir"))) {
    return NextResponse.json({ ok: false, error: "Nao autorizado" }, { status: 403 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );
  const barrado = await barrarTitularForaDoEscopo(supabase, titularId);
  if (barrado) return barrado;

  const body = await request.json().catch(() => null);
  const perfil = body?.perfil;
  if (!perfilValido(perfil)) {
    return NextResponse.json({ ok: false, error: "Perfil inválido." }, { status: 400 });
  }

  // Lê o valor anterior para a trilha (antes/depois).
  const { data: antes } = await supabase
    .from("titulares")
    .select("perfil")
    .eq("id", titularId)
    .maybeSingle();

  const { data: atualizado, error } = await supabase
    .from("titulares")
    .update({ perfil })
    .eq("id", titularId)
    .select("id")
    .maybeSingle();
  if (error) {
    return NextResponse.json({ ok: false, error: "Não foi possível atualizar o perfil." }, { status: 500 });
  }
  // Admin global não passa por barrarTitularForaDoEscopo; se o id não existe, o
  // update afeta 0 linhas — 404 em vez de um "ok" silencioso.
  if (!atualizado) {
    return NextResponse.json({ ok: false, error: "Titular não encontrado" }, { status: 404 });
  }

  try {
    await registrarAuditoriaAdmin(supabase, {
      usuario: (await usuarioAdminAtual()) ?? "sessao-expirada",
      acao: "titular.perfil.definir",
      alvo: titularId,
      detalhe: { de: (antes as { perfil?: string | null } | null)?.perfil ?? null, para: perfil },
      ip: obterIp(request),
    });
  } catch {
    console.error("[titular-perfil] falha ao registrar auditoria (perfil já atualizado)");
  }

  return NextResponse.json({ ok: true, perfil });
}
