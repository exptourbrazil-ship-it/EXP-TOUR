import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verificarSessaoAdmin, ADMIN_SESSION_COOKIE } from "@/lib/admin-session";

// Guarda server-side para paginas de admin: verifica a assinatura completa
// do cookie de sessao (HMAC) no runtime Node. Se invalido/ausente,
// redireciona para /admin/login. Retorna o usuario autenticado.
export function exigirAdmin(next?: string): { usuario: string } {
  const token = cookies().get(ADMIN_SESSION_COOKIE)?.value;
  const sessao = verificarSessaoAdmin(token);
  if (!sessao) {
    const alvo = next ? "/admin/login?next=" + encodeURIComponent(next) : "/admin/login";
    redirect(alvo);
  }
  return sessao;
}

// Versao para rotas de API: retorna true/false sem redirecionar.
export function checarAdminCookie(): boolean {
  const token = cookies().get(ADMIN_SESSION_COOKIE)?.value;
  return !!verificarSessaoAdmin(token);
}
