import { NextResponse } from "next/server";
import { verificarTokenCodigo, ADMIN_CODIGO_COOKIE } from "@/lib/admin-codigo";
import { criarSessaoAdmin, ADMIN_SESSION_COOKIE } from "@/lib/admin-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSAO_MAX_AGE = 60 * 60 * 12; // 12 horas

// Passo 2 do login do admin: confere o código informado contra o token
// assinado guardado no cookie (definido no /request). Se válido, abre a
// sessão de admin (cookie httpOnly de 12h) e remove o cookie do código.
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({} as any));
  const codigo = typeof body?.codigo === "string" ? body.codigo.trim() : "";

  if (!/^[0-9]{6}$/.test(codigo)) {
    return NextResponse.json({ error: "Código inválido." }, { status: 400 });
  }

  const token = request.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(ADMIN_CODIGO_COOKIE + "="))
    ?.slice(ADMIN_CODIGO_COOKIE.length + 1);

  let valido = false;
  try {
    valido = verificarTokenCodigo(token ? decodeURIComponent(token) : null, codigo);
  } catch {
    return NextResponse.json(
      { error: "Login de admin nao configurado no servidor." },
      { status: 500 }
    );
  }

  if (!valido) {
    return NextResponse.json({ error: "Código inválido ou expirado." }, { status: 401 });
  }

  const sessao = criarSessaoAdmin(process.env.ADMIN_EMAIL || "rodrigo@exp-tour.com");

  const res = NextResponse.json({ success: true });
  res.cookies.set(ADMIN_SESSION_COOKIE, sessao, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSAO_MAX_AGE,
  });
  res.cookies.set(ADMIN_CODIGO_COOKIE, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}
