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

// ATENCAO: aceita o Bearer ADMIN_CAMBIO_SECRET como ATALHO do RBAC. Sobrou UM
// unico chamador: `/api/admin/cambio-manual`, que e a rota para a qual esse
// segredo existe. NAO use em rota nova.
//
// Por que: o segredo e uma credencial de nivel-grupo. Quem o tem passa por
// qualquer capacidade, a trilha atribui a acao a "bearer-secret" em vez de uma
// pessoa, e como nao ha e-mail de sessao o `escopoTenantAdmin` promove o
// portador a super-admin GLOBAL, atravessando as duas marcas. Por isso o atalho
// foi fechado nas 29 rotas de dinheiro, documento (PII), acerto, cancelamento e
// configuracao — todas usam `checarCapacidadeAdmin`, que so aceita sessao.
//
// (`checarAdminRequest`, a versao sem capacidade, foi removida por nao ter mais
// chamador: enquanto existisse, convidava a reintroduzir o atalho.)
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
