import { NextResponse } from "next/server";
import { criarSessaoAdmin, ADMIN_SESSION_COOKIE, compararSeguro } from "@/lib/admin-session";

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
