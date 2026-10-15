// NB: modulo server-only (usa a service role do Supabase). So deve ser
// importado por server components e rotas de API — nunca por codigo client.
import { createClient } from "@supabase/supabase-js";
import { agruparCarteira } from "@/lib/clientes";
import type { ClienteCarteira } from "@/lib/clientes";
import { hojeBrasilISO } from "@/lib/admin-financeiro";
import { escopoTenantAdmin } from "@/lib/admin-tenant";

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  return createClient(supabaseUrl, serviceRoleKey);
}

// Carrega a carteira de clientes: titulares + contratos + parcelas, agregados
// pelo helper puro agruparCarteira. Lanca em caso de falha de query.
// modo="ativos" (padrao) oculta os arquivados; "arquivados" lista SO os
// arquivados (para restaurar). Anonimizados nao sao filtrados aqui.
export async function carregarClientes(
  modo: "ativos" | "arquivados" = "ativos",
): Promise<ClienteCarteira[]> {
  const supabase = getSupabase();
  // Escopo do admin (isolamento por tenant): admin escopado so enxerga titulares
  // e contratos do SEU tenant, como as rotas de API. Global => sem filtro. Erro
  // ao resolver o escopo propaga (a pagina cai no estado de erro): falha FECHADA.
  const escopo = await escopoTenantAdmin(supabase);

  let q = supabase
    .from("titulares")
    .select("id, nome_completo, cpf, telefone, email, data_inicio");
  if (!escopo.global) q = q.eq("tenant_id", escopo.tenantId);
  q = modo === "arquivados" ? q.not("arquivado_em", "is", null) : q.is("arquivado_em", null);
  const { data: titulares, error: erroTitulares } = await q;
  if (erroTitulares) throw new Error("Falha ao carregar titulares.");

  let qContratos = supabase
    .from("contratos")
    .select("id, titular_id, estudante_nome, pais_destino, moeda");
  if (!escopo.global) qContratos = qContratos.eq("tenant_id", escopo.tenantId);
  const { data: contratos, error: erroContratos } = await qContratos;
  if (erroContratos) throw new Error("Falha ao carregar contratos.");

  const { data: parcelas, error: erroParcelas } = await supabase
    .from("parcelas")
    .select("contrato_id, status, valor_atual, vencimento");
  if (erroParcelas) throw new Error("Falha ao carregar parcelas.");

  // Processos (excecoes) ATIVOS por titular — status nao terminais. Usado para
  // o sinal de "processo ativo" na carteira. Best-effort: uma falha aqui NAO
  // derruba a lista (o sinal some), diferente das leituras de base acima.
  let excecoes: { titular_id: string }[] = [];
  const { data: excecoesData, error: erroExcecoes } = await supabase
    .from("case_exceptions")
    .select("titular_id")
    .in("status", ["aberta", "em_andamento"]);
  if (erroExcecoes) {
    // Best-effort: o sinal "processo ativo" some, mas a carteira segue. Loga sem
    // PII (só a mensagem) para o defeito nao passar despercebido.
    console.warn("[admin-clientes] falha ao ler processos ativos:", erroExcecoes.message);
  }
  excecoes = (excecoesData || []).filter((e) => !!e.titular_id) as { titular_id: string }[];

  // Parcelas e processos entram so quando pertencem aos contratos/titulares do
  // escopo (a agregacao ja os ignora; filtrar aqui evita carregar o resto).
  const idsContratos = new Set((contratos || []).map((c: any) => c.id));
  const idsTitulares = new Set((titulares || []).map((t: any) => t.id));
  const parcelasDoEscopo = escopo.global
    ? parcelas || []
    : (parcelas || []).filter((p: any) => idsContratos.has(p.contrato_id));
  const excecoesDoEscopo = escopo.global ? excecoes : excecoes.filter((e) => idsTitulares.has(e.titular_id));

  return agruparCarteira(
    (titulares || []) as any,
    (contratos || []) as any,
    parcelasDoEscopo as any,
    hojeBrasilISO(),
    excecoesDoEscopo
  );
}
