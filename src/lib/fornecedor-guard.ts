import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import {
  verificarSessaoFornecedor,
  FORNECEDOR_SESSION_COOKIE,
  type SessaoFornecedor,
} from "@/lib/fornecedor-session";

// Guardas do Portal do Fornecedor. Mesmo desenho do admin-guard.ts: a pagina
// server-side exige a sessao (redireciona para /fornecedor/login se ausente) e
// as rotas de API conferem sem redirecionar.

// A sessao e um token HMAC de 12h; sozinha ela nao sabe se o usuario foi
// desativado/arquivado depois do login. Revalida no banco a cada uso: o usuario
// precisa seguir ativo, nao arquivado e do MESMO fornecedor do token; o papel do
// banco vence o do cookie. Falha FECHADA (erro de banco, linha ausente => sem sessao).
async function revalidarFornecedor(sessao: SessaoFornecedor | null): Promise<SessaoFornecedor | null> {
  if (!sessao) return null;
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL as string,
      process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    );
    const { data, error } = await supabase
      .from("supplier_user")
      .select("role, active, archived_at, supplier_id")
      .eq("id", sessao.supplierUserId)
      .maybeSingle();
    if (error || !data) return null;
    if (data.active !== true || data.archived_at != null) return null;
    if (String(data.supplier_id) !== sessao.supplierId) return null;
    return { ...sessao, role: String(data.role || sessao.role) };
  } catch {
    return null;
  }
}

// Guarda de PAGINA: exige sessao valida; senao redireciona para o login
// preservando o destino. Retorna a sessao do fornecedor.
export async function exigirFornecedor(next?: string): Promise<SessaoFornecedor> {
  const token = (await cookies()).get(FORNECEDOR_SESSION_COOKIE)?.value;
  const sessao = await revalidarFornecedor(verificarSessaoFornecedor(token));
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
  return revalidarFornecedor(verificarSessaoFornecedor(token));
}
