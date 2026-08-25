import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checarCapacidadeRequest, usuarioAdminAtual } from "@/lib/admin-guard";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";
import { obterIp, checarELimitar } from "@/lib/rate-limit";
import { enviarConviteFornecedorEmail } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Teto de reenvios do convite por usuario-alvo (protege a reputacao do
// remetente: um admin nao deve poder disparar e-mails em rajada ao mesmo
// destinatario). Janela de 10 min.
const REENVIO_JANELA_SEG = Number(process.env.RATE_LIMIT_JANELA_SEG || "600");
const REENVIO_MAX = Number(process.env.RATE_LIMIT_FORNECEDOR_CONVITE || "3");

// Gerencia um usuario do Portal do Fornecedor ja existente:
//  - { active: boolean }        -> ativa/desativa o acesso (revoga/restaura);
//  - { reenviarConvite: true }  -> reenvia o e-mail de boas-vindas/login.
// Autorizacao: capacidade fornecedores.gerir.
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await checarCapacidadeRequest(request, "fornecedores.gerir"))) {
    return NextResponse.json({ ok: false, erro: "Nao autorizado" }, { status: 401 });
  }

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ ok: false, erro: "ID ausente." }, { status: 400 });

  const body = await request.json().catch(() => ({} as Record<string, unknown>));

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: usuario } = await supabase
    .from("supplier_user")
    .select("id, name, email, language, active, archived_at")
    .eq("id", id)
    .maybeSingle();

  if (!usuario) {
    return NextResponse.json({ ok: false, erro: "Usuário não encontrado." }, { status: 404 });
  }

  const quem = (await usuarioAdminAtual()) ?? "bearer-secret";
  const ip = obterIp(request);

  // Reenvio do convite (nao muda o registro; so dispara o e-mail).
  if (body?.reenviarConvite === true) {
    if (!usuario.active || usuario.archived_at) {
      return NextResponse.json(
        { ok: false, erro: "Ative o acesso antes de reenviar o convite." },
        { status: 409 }
      );
    }
    // Teto de reenvios por usuario-alvo (anti-spam / reputacao do remetente).
    if (!(await checarELimitar(supabase, `fornecedor-convite:${usuario.id}`, REENVIO_MAX, REENVIO_JANELA_SEG))) {
      return NextResponse.json(
        { ok: false, erro: "Muitos reenvios para este usuário. Aguarde alguns minutos." },
        { status: 429 }
      );
    }
    try {
      await enviarConviteFornecedorEmail(usuario.email, usuario.name || "", usuario.language || "en");
    } catch (err) {
      return NextResponse.json(
        { ok: false, erro: err instanceof Error ? err.message : "Falha ao enviar o convite." },
        { status: 502 }
      );
    }
    await registrarAuditoriaAdmin(supabase, {
      usuario: quem,
      acao: "fornecedores.usuario.reenviar_convite",
      alvo: usuario.id,
      ip,
    });
    return NextResponse.json({ ok: true, emailEnviado: true });
  }

  // Ativar/desativar o acesso.
  if (typeof body?.active === "boolean") {
    const active = body.active as boolean;
    // Ao reativar, tambem limpa archived_at: senao o acesso ficaria ativo porem
    // "arquivado" (estado inconsistente que bloquearia o reenvio de convite).
    const patch: Record<string, unknown> = { active, updated_at: new Date().toISOString() };
    if (active) patch.archived_at = null;
    const { data: atualizado, error } = await supabase
      .from("supplier_user")
      .update(patch)
      .eq("id", id)
      .select("id, name, email, role, language, active, zoho_vendor_id")
      .single();

    if (error || !atualizado) {
      console.error("[suppliers/users PATCH] update falhou:", error?.message);
      return NextResponse.json({ ok: false, erro: "Falha ao atualizar o acesso." }, { status: 500 });
    }

    await registrarAuditoriaAdmin(supabase, {
      usuario: quem,
      acao: active ? "fornecedores.usuario.ativar" : "fornecedores.usuario.desativar",
      alvo: atualizado.id,
      ip,
    });
    return NextResponse.json({ ok: true, usuario: atualizado });
  }

  return NextResponse.json({ ok: false, erro: "Nada a atualizar." }, { status: 400 });
}
