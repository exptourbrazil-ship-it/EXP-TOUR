// NB: modulo server-only (usa a service role do Supabase). So deve ser
// importado por server components e rotas de API — nunca por codigo client.
import { createClient } from "@supabase/supabase-js";
import { agruparCarteira } from "@/lib/clientes";
import type { ClienteCarteira } from "@/lib/clientes";
import { hojeBrasilISO } from "@/lib/admin-financeiro";

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

  let q = supabase
    .from("titulares")
    .select("id, nome_completo, cpf, telefone, email, data_inicio");
  q = modo === "arquivados" ? q.not("arquivado_em", "is", null) : q.is("arquivado_em", null);
  const { data: titulares, error: erroTitulares } = await q;
  if (erroTitulares) throw new Error("Falha ao carregar titulares.");

  const { data: contratos, error: erroContratos } = await supabase
    .from("contratos")
    .select("id, titular_id, estudante_nome, pais_destino, moeda");
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

  return agruparCarteira(
    (titulares || []) as any,
    (contratos || []) as any,
    (parcelas || []) as any,
    hojeBrasilISO(),
    excecoes
  );
}
