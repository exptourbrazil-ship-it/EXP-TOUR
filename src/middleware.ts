import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ADMIN_SESSION_COOKIE } from "@/lib/admin-session";

// Protege todas as rotas /admin/* exigindo a presenca do cookie de sessao
// de admin. A verificacao completa da assinatura (HMAC) e feita nas paginas
// no runtime Node; aqui, na borda, fazemos apenas o redirecionamento rapido
// para /admin/login quando nao ha sessao. A propria pagina de login e as
// rotas de API de login/logout ficam liberadas.
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const ehLogin = pathname === "/admin/login";
  const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;

  if (!token && !ehLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
