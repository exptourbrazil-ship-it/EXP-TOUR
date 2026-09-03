// Servico de ESCRITA das REGRAS DE ELEGIBILIDADE de um produto (eligibility_rule)
// pela Area Administrativa. SERVER-ONLY (service role).
//
// POSSE: o produto tem que ser do tenant. As regras vivem em eligibility_rule
// (tenant_id + product_id). A operacao SUBSTITUI o conjunto de regras do produto
// (delete + insert); sem transacao no PostgREST, guardamos um snapshot e
// restauramos numa falha parcial.
import type { SupabaseClient } from "@supabase/supabase-js";
import { validarElegibilidade, type Falha, type RegraNorm } from "@/lib/elegibilidade";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";

export class ElegibilidadeAdminErro extends Error {
  constructor(
    public codigo: "validacao" | "produto_nao_encontrado" | "migracao_ausente" | "falha_persistir",
    public falhas?: Falha[],
  ) {
    super(codigo);
    this.name = "ElegibilidadeAdminErro";
  }
}

async function produtoDoTenant(supabase: SupabaseClient, tenantId: string, productId: string): Promise<boolean> {
  const { data } = await supabase.from("product").select("id, tenant_id").eq("id", productId).maybeSingle();
  return !!data && (data as { tenant_id?: string }).tenant_id === tenantId;
}

// Linhas atuais (para snapshot de restauracao).
async function snapshotRegras(supabase: SupabaseClient, tenantId: string, productId: string): Promise<RegraNorm[]> {
  const { data } = await supabase
    .from("eligibility_rule")
    .select("group_index, attribute, operator, value, is_blocking")
    .eq("tenant_id", tenantId)
    .eq("product_id", productId);
  return (data ?? []).map((r: any) => ({
    group_index: r.group_index ?? 0,
    attribute: r.attribute,
    operator: r.operator,
    value: r.value,
    is_blocking: r.is_blocking ?? false,
  }));
}

export type SalvarElegibilidadeArgs = {
  tenantId: string;
  actor: string;
  ip?: string | null;
  productId: string; // vem da URL (server)
  regras: unknown; // corpo cru (array de regras)
};

// Substitui o conjunto de regras de elegibilidade do produto. Devolve a contagem.
export async function salvarElegibilidade(
  supabase: SupabaseClient,
  args: SalvarElegibilidadeArgs,
): Promise<{ total: number }> {
  const { tenantId, actor, ip, productId } = args;

  // Posse: o produto tem que ser do tenant (checado ANTES de validar/escrever).
  if (!(await produtoDoTenant(supabase, tenantId, productId))) {
    throw new ElegibilidadeAdminErro("produto_nao_encontrado");
  }

  // product_id vem da URL (server), nunca do corpo — injetamos aqui.
  const r = validarElegibilidade({ product_id: productId, regras: args.regras });
  if (!r.ok) throw new ElegibilidadeAdminErro("validacao", r.falhas);
  const regras = r.valor.regras;

  // Contagem de bloqueantes ANTES (para a trilha registrar remocao de regra de
  // compliance). Regras bloqueantes impedem a emissao da cotacao.
  const antes = await snapshotRegras(supabase, tenantId, productId);
  const bloqueantesAntes = antes.filter((x) => x.is_blocking).length;
  const bloqueantesDepois = regras.filter((x) => x.is_blocking).length;

  // Substituicao ATOMICA (delete+insert numa transacao, sob advisory lock) via
  // funcao Postgres. Compliance-sensivel: NUNCA fazer o replace nao-transacional
  // (uma falha parcial deixaria o produto sem regra bloqueante — fail-open — e ha
  // janela de corrida com a emissao de cotacao). Se a funcao ainda nao foi
  // aplicada, RECUSAMOS (migracao_ausente) em vez de degradar para o caminho inseguro.
  const { data, error } = await supabase.rpc("substituir_elegibilidade", {
    p_tenant_id: tenantId,
    p_product_id: productId,
    p_regras: regras.map((x) => ({
      group_index: x.group_index,
      attribute: x.attribute,
      operator: x.operator,
      value: x.value,
      is_blocking: x.is_blocking,
    })),
  });
  if (error) {
    // PostgREST: funcao ausente -> PGRST202 (nao confundir com outros "does not exist").
    if ((error as { code?: string }).code === "PGRST202") {
      console.error("[elegibilidade] funcao substituir_elegibilidade ausente (aplicar migracao)");
      throw new ElegibilidadeAdminErro("migracao_ausente");
    }
    console.error("[elegibilidade] rpc substituir:", error.message);
    throw new ElegibilidadeAdminErro("falha_persistir");
  }
  const total = typeof data === "number" ? data : regras.length;

  await registrarAuditoriaAdmin(supabase, {
    usuario: actor,
    acao: "produto.elegibilidade.definir",
    alvo: productId,
    detalhe: {
      total,
      bloqueantes_antes: bloqueantesAntes,
      bloqueantes_depois: bloqueantesDepois,
      removeu_bloqueante: bloqueantesDepois < bloqueantesAntes,
    },
    ip: ip ?? null,
  });

  return { total };
}

// Leitura para a UI: regras atuais do produto (se do tenant), ou null.
export async function obterElegibilidadeAdmin(
  supabase: SupabaseClient,
  tenantId: string,
  productId: string,
): Promise<RegraNorm[] | null> {
  if (!(await produtoDoTenant(supabase, tenantId, productId))) return null;
  return snapshotRegras(supabase, tenantId, productId);
}
