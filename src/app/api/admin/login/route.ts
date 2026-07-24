import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { criarSessaoAdmin, ADMIN_SESSION_COOKIE, compararSeguro } from "@/lib/admin-session";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";
import { obterIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

// POST { usuario, senha } -> valida contra ADMIN_USER / ADMIN_PASSWORD e cria
// um cookie de sessao de admin (httpOnly, 12h). As credenciais ficam apenas
// nas variaveis de ambiente da Vercel; nunca no codigo.
export async function POST(request: Request) {
  let body: any = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const usuario = String(body.usuario || "").trim();
  const senha = String(body.senha || "");

  const usuarioEsperado = process.env.ADMIN_USER;
  const senhaEsperada = process.env.ADMIN_PASSWORD;

  if (!usuarioEsperado || !senhaEsperada) {
    return NextResponse.json(
      { ok: false, erro: "Login de admin nao configurado no servidor." },
      { status: 500 }
    );
  }

  const usuarioOk = compararSeguro(usuario, usuarioEsperado);
  const senhaOk = compararSeguro(senha, senhaEsperada);

  if (!usuarioOk || !senhaOk) {
    return NextResponse.json(
      { ok: false, erro: "Usuario ou senha invalidos." },
      { status: 401 }
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  if (supabaseUrl && serviceRoleKey) {
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    await registrarAuditoriaAdmin(supabase, {
      usuario,
      acao: "admin.login",
      alvo: null,
      detalhe: { metodo: "usuario_senha" },
      ip: obterIp(request),
    });
  }

  const token = criarSessaoAdmin(usuario);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return res;
}
