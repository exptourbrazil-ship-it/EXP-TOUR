import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checarCapacidadeRequest, usuarioAdminAtual } from "@/lib/admin-guard";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";
import { obterIp } from "@/lib/rate-limit";
import { validarConvite } from "@/lib/supplier-user-admin";
import { enviarConviteFornecedorEmail } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Convida (cria) um usuario do Portal do Fornecedor: escolas sem e-mail no Zoho,
// ou um segundo contato de uma escola. O acesso e criado A MAO (zoho_vendor_id
// NULL), entao a sincronizacao de Vendors NUNCA o toca.
//
// Autorizacao: capacidade fornecedores.gerir (com fallback Bearer, como as
// demais rotas admin). O tenant vem do proprio supplier (a escola dona do acesso).
export async function POST(request: Request) {
  if (!(await checarCapacidadeRequest(request, "fornecedores.gerir"))) {
    return NextResponse.json({ ok: false, erro: "Nao autorizado" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const validado = validarConvite(body);
  if (!validado.ok) {
    return NextResponse.json({ ok: false, erro: validado.erro }, { status: 400 });
  }
  const { supplierId, name, email, role, language } = validado.dados;
  // Enviar o e-mail de boas-vindas por padrao; so nao envia se pedido explicito.
  const enviarEmail = body?.enviarEmail !== false;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // A escola precisa existir; usamos o tenant_id dela (nao confiamos num tenant
  // vindo do cliente) e o nome para a auditoria.
  const { data: supplier } = await supabase
    .from("supplier")
    .select("id, tenant_id, display_name")
    .eq("id", supplierId)
    .maybeSingle();

  if (!supplier) {
    return NextResponse.json({ ok: false, erro: "Fornecedor não encontrado." }, { status: 404 });
  }

  const { data: criado, error } = await supabase
    .from("supplier_user")
    .insert({
      tenant_id: supplier.tenant_id,
      supplier_id: supplier.id,
      email,
      name,
      role,
      language,
      active: true,
    })
    .select("id, name, email, role, language, active, zoho_vendor_id, created_at")
    .single();

  if (error || !criado) {
    // E-mail duplicado (indice unico em supplier_user.email) -> 409 amigavel.
    if ((error as { code?: string } | null)?.code === "23505") {
      return NextResponse.json(
        { ok: false, erro: "Já existe um usuário com esse e-mail." },
        { status: 409 }
      );
    }
    console.error("[suppliers/users] insert falhou:", error?.message);
    return NextResponse.json({ ok: false, erro: "Falha ao criar o usuário." }, { status: 500 });
  }

  const usuario = (await usuarioAdminAtual()) ?? "bearer-secret";
  await registrarAuditoriaAdmin(supabase, {
    usuario,
    acao: "fornecedores.usuario.convidar",
    alvo: criado.id,
    detalhe: { supplier: supplier.display_name, role, language, enviarEmail },
    ip: obterIp(request),
  });

  // Envio do convite: best-effort. O usuario ja foi criado; se o e-mail falhar,
  // devolvemos ok:true com um aviso (o admin pode reenviar depois).
  let emailEnviado = false;
  let avisoEmail: string | null = null;
  if (enviarEmail) {
    try {
      await enviarConviteFornecedorEmail(email, name, language);
      emailEnviado = true;
    } catch (err) {
      avisoEmail = err instanceof Error ? err.message : "Falha ao enviar o convite por e-mail.";
    }
  }

  return NextResponse.json({ ok: true, usuario: criado, emailEnviado, avisoEmail });
}
