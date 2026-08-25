// Acesso a dados do Portal do Fornecedor. SERVER-ONLY (usa a service role).
//
// REGRA DE OURO: toda consulta filtra por supplier_id da sessao. Uma escola
// NUNCA pode ver estudante/contrato de outra. O filtro e sempre passado como
// argumento (nunca vem do cliente) e o detalhe reconfere a posse.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function getServiceClient(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  return createClient(supabaseUrl, serviceRoleKey);
}

export type ContadoresPainel = { total: number; ativos: number; cancelados: number };

export type EstudanteResumo = {
  contratoId: string;
  estudanteNome: string | null;
  titularNome: string | null;
  programa: string | null;
  paisDestino: string | null;
  vistoStatus: string | null;
  canceladoEm: string | null;
};

export type EstudanteDetalhe = EstudanteResumo & {
  estudanteSexo: string | null;
  titularEmail: string | null;
  moeda: string | null;
  escolaEndereco: string | null;
  acomodacaoEndereco: string | null;
  contatoLocalNome: string | null;
  contatoLocalTelefone: string | null;
};

// Contadores do painel: total de estudantes/contratos do fornecedor e quantos
// estao ativos vs cancelados.
export async function contarPainelFornecedor(
  supabase: SupabaseClient,
  supplierId: string
): Promise<ContadoresPainel> {
  const { data } = await supabase
    .from("contratos")
    .select("id, cancelado_em")
    .eq("supplier_id", supplierId);
  const total = data?.length ?? 0;
  const cancelados = (data ?? []).filter((c) => (c as { cancelado_em?: string | null }).cancelado_em).length;
  return { total, ativos: total - cancelados, cancelados };
}

// Lista os estudantes (contratos) do fornecedor logado.
export async function listarEstudantesDoFornecedor(
  supabase: SupabaseClient,
  supplierId: string
): Promise<EstudanteResumo[]> {
  const { data } = await supabase
    .from("contratos")
    .select("id, nome, estudante_nome, pais_destino, visto_status, cancelado_em, titular:titulares(nome_completo)")
    .eq("supplier_id", supplierId)
    .order("created_at", { ascending: false });

  return (data ?? []).map((c: any) => ({
    contratoId: c.id,
    estudanteNome: c.estudante_nome ?? null,
    titularNome: c.titular?.nome_completo ?? null,
    programa: c.nome ?? null,
    paisDestino: c.pais_destino ?? null,
    vistoStatus: c.visto_status ?? null,
    canceladoEm: c.cancelado_em ?? null,
  }));
}

// Detalhe reduzido de UM estudante. RECONFERE a posse: retorna null se o
// contrato nao pertencer a este fornecedor (defesa em profundidade: mesmo que
// alguem force um contratoId de outra escola, nada vaza).
export async function obterEstudanteDoFornecedor(
  supabase: SupabaseClient,
  supplierId: string,
  contratoId: string
): Promise<EstudanteDetalhe | null> {
  const { data: c } = await supabase
    .from("contratos")
    .select(
      "id, nome, estudante_nome, estudante_sexo, pais_destino, visto_status, cancelado_em, moeda, supplier_id, titular:titulares(nome_completo, email), viagem:viagem_info(escola_endereco, acomodacao_endereco, contato_local_nome, contato_local_telefone)"
    )
    .eq("id", contratoId)
    .maybeSingle();

  if (!c) return null;
  // POSSE: o contrato tem que ser deste fornecedor.
  if ((c as any).supplier_id !== supplierId) return null;

  const x = c as any;
  const viagem = Array.isArray(x.viagem) ? x.viagem[0] : x.viagem;
  return {
    contratoId: x.id,
    estudanteNome: x.estudante_nome ?? null,
    estudanteSexo: x.estudante_sexo ?? null,
    titularNome: x.titular?.nome_completo ?? null,
    titularEmail: x.titular?.email ?? null,
    programa: x.nome ?? null,
    paisDestino: x.pais_destino ?? null,
    vistoStatus: x.visto_status ?? null,
    canceladoEm: x.cancelado_em ?? null,
    moeda: x.moeda ?? null,
    escolaEndereco: viagem?.escola_endereco ?? null,
    acomodacaoEndereco: viagem?.acomodacao_endereco ?? null,
    contatoLocalNome: viagem?.contato_local_nome ?? null,
    contatoLocalTelefone: viagem?.contato_local_telefone ?? null,
  };
}
