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

// Auth padrao das rotas de API admin: aceita a sessao de admin (cookie) e,
// por compatibilidade, o Bearer ADMIN_CAMBIO_SECRET. A sessao e o caminho
// preferido; o Bearer permanece para clientes/scripts que ainda o usem.
export async function checarAdminRequest(request: Request): Promise<boolean> {
  if (await checarAdminCookie()) return true;
  const adminSecret = process.env.ADMIN_CAMBIO_SECRET;
  if (!adminSecret) return false;
  return request.headers.get("authorization") === "Bearer " + adminSecret;
}

// Retorna o usuario da sessao de admin (cookie), ou null se nao houver sessao
// valida. Usado pela trilha de auditoria para saber QUEM executou a acao.
export async function usuarioAdminAtual(): Promise<string | null> {
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
  const sessao = verificarSessaoAdmin(token);
  return sessao ? sessao.usuario : null;
}
