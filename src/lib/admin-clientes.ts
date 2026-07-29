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
export async function carregarClientes(): Promise<ClienteCarteira[]> {
  const supabase = getSupabase();

  const { data: titulares, error: erroTitulares } = await supabase
    .from("titulares")
    .select("id, nome_completo, cpf, telefone, email, data_inicio");
  if (erroTitulares) throw new Error("Falha ao carregar titulares.");

  const { data: contratos, error: erroContratos } = await supabase
    .from("contratos")
    .select("id, titular_id, estudante_nome, pais_destino, moeda");
  if (erroContratos) throw new Error("Falha ao carregar contratos.");

  const { data: parcelas, error: erroParcelas } = await supabase
    .from("parcelas")
    .select("contrato_id, status, valor_atual, vencimento");
  if (erroParcelas) throw new Error("Falha ao carregar parcelas.");

  return agruparCarteira(
    (titulares || []) as any,
    (contratos || []) as any,
    (parcelas || []) as any,
    hojeBrasilISO()
  );
}
