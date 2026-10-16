// Preambulo das rotas /api/fornecedor/faturas/**: sessao do fornecedor (revalidada
// no banco), papel financeiro (finance ou supplier_admin — fatura e dado financeiro
// da escola), tenant do deploy. Posse sempre pelo supplierId da SESSAO.
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sessaoFornecedorAtual } from "@/lib/fornecedor-guard";
import { getServiceClient } from "@/lib/fornecedor-dados";
import { tenantIdAtual } from "@/lib/catalog-service";
import type { SessaoFornecedor } from "@/lib/fornecedor-session";

export function papelFinanceiro(role: string): boolean {
  return role === "finance" || role === "supplier_admin";
}

export async function contextoFornecedorFatura(): Promise<
  { ok: true; supabase: SupabaseClient; tenantId: string; sessao: SessaoFornecedor } | { ok: false; res: NextResponse }
> {
  const sessao = await sessaoFornecedorAtual();
  if (!sessao) return { ok: false, res: NextResponse.json({ ok: false, erro: "Não autenticado." }, { status: 401 }) };
  if (!papelFinanceiro(sessao.role)) return { ok: false, res: NextResponse.json({ ok: false, erro: "Sem permissão." }, { status: 403 }) };
  const supabase = getServiceClient();
  try {
    return { ok: true, supabase, tenantId: await tenantIdAtual(supabase), sessao };
  } catch {
    return { ok: false, res: NextResponse.json({ ok: false, erro: "Falha ao resolver o tenant." }, { status: 500 }) };
  }
}
