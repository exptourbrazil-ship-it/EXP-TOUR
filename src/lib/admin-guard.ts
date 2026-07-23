import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verificarSessaoAdmin, ADMIN_SESSION_COOKIE } from "@/lib/admin-session";

// Guarda server-side para paginas de admin: verifica a assinatura completa
// do cookie de sessao (HMAC) no runtime Node. Se invalido/ausente,
// redireciona para /admin/login. Retorna o usuario autenticado.
export async function exigirAdmin(next?: string): Promise<{ usuario: string }> {
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
  const sessao = verificarSessaoAdmin(token);
  if (!sessao) {
    const alvo = next ? "/admin/login?next=" + encodeURIComponent(next) : "/admin/login";
    redirect(alvo);
  }
  return sessao;
}

// Versao para rotas de API: retorna true/false sem redirecionar.
export async function checarAdminCookie(): Promise<boolean> {
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
  return !!verificarSessaoAdmin(token);
}
