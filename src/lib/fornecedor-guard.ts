import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  verificarSessaoFornecedor,
  FORNECEDOR_SESSION_COOKIE,
  type SessaoFornecedor,
} from "@/lib/fornecedor-session";

// Guardas do Portal do Fornecedor. Mesmo desenho do admin-guard.ts: a pagina
// server-side exige a sessao (redireciona para /fornecedor/login se ausente) e
// as rotas de API conferem sem redirecionar.

// Guarda de PAGINA: exige sessao valida; senao redireciona para o login
// preservando o destino. Retorna a sessao do fornecedor.
export async function exigirFornecedor(next?: string): Promise<SessaoFornecedor> {
  const token = (await cookies()).get(FORNECEDOR_SESSION_COOKIE)?.value;
  const sessao = verificarSessaoFornecedor(token);
  if (!sessao) {
    const alvo = next
      ? "/fornecedor/login?next=" + encodeURIComponent(next)
      : "/fornecedor/login";
    redirect(alvo);
  }
  return sessao;
}

// Sessao atual (usuario + supplier) para rotas de API, ou null se nao houver
// sessao valida.
export async function sessaoFornecedorAtual(): Promise<SessaoFornecedor | null> {
  const token = (await cookies()).get(FORNECEDOR_SESSION_COOKIE)?.value;
  return verificarSessaoFornecedor(token);
}
