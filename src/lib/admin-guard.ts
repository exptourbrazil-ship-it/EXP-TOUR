import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verificarSessaoAdmin, ADMIN_SESSION_COOKIE } from "@/lib/admin-session";
import { podeAdmin, type CapacidadeAdmin, type PapelAdmin } from "@/lib/admin-roles";

// Guarda server-side para paginas de admin: verifica a assinatura completa
// do cookie de sessao (HMAC) no runtime Node. Se invalido/ausente,
// redireciona para /admin/login. Retorna o usuario e o papel autenticados.
export async function exigirAdmin(next?: string): Promise<{ usuario: string; papel: PapelAdmin }> {
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
  const sessao = verificarSessaoAdmin(token);
  if (!sessao) {
    const alvo = next ? "/admin/login?next=" + encodeURIComponent(next) : "/admin/login";
    redirect(alvo);
  }
  return sessao;
}

// Guarda de PAGINA por capacidade: exige sessao E o papel poder a capacidade.
// Sem sessao -> login; sem permissao -> /admin (com aviso). Ver admin-roles.ts.
export async function exigirCapacidade(
  capacidade: CapacidadeAdmin,
  next?: string
): Promise<{ usuario: string; papel: PapelAdmin }> {
  const sessao = await exigirAdmin(next);
  if (!podeAdmin(sessao.papel, capacidade)) {
    redirect("/admin?erro=sem_permissao");
  }
  return sessao;
}

// Versao para rotas de API: retorna true/false sem redirecionar.
export async function checarAdminCookie(): Promise<boolean> {
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
  return !!verificarSessaoAdmin(token);
}

// Sessao completa (usuario + papel) para rotas de API, ou null se nao houver
// sessao valida.
export async function sessaoAdminAtual(): Promise<{ usuario: string; papel: PapelAdmin } | null> {
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
  return verificarSessaoAdmin(token);
}

// Guarda de ROTA DE API por capacidade: true so se ha sessao valida E o papel
// pode a capacidade. Use nas rotas novas/refatoradas; as rotas legadas seguem
// com checarAdminCookie (qualquer admin) ate serem migradas para capacidades.
export async function checarCapacidadeAdmin(capacidade: CapacidadeAdmin): Promise<boolean> {
  const sessao = await sessaoAdminAtual();
  return !!sessao && podeAdmin(sessao.papel, capacidade);
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

// Mesma compat Bearer do checarAdminRequest, mas com a sessao de cookie gateada
// por capacidade (RBAC). Use nas rotas de API que ja tem uma capacidade definida.
export async function checarCapacidadeRequest(request: Request, capacidade: CapacidadeAdmin): Promise<boolean> {
  if (await checarCapacidadeAdmin(capacidade)) return true;
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
