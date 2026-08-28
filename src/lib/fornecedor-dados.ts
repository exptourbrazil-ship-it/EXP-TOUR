// Acesso a dados do Portal do Fornecedor. SERVER-ONLY (usa a service role).
//
// REGRA DE OURO: toda consulta filtra por supplier_id da sessao. Uma escola
// NUNCA pode ver estudante/contrato de outra. O filtro e sempre passado como
// argumento (nunca vem do cliente) e o detalhe reconfere a posse.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  derivarPendencias,
  type ContratoPendencia,
  type DocPendencia,
  type Pendencia,
} from "@/lib/fornecedor-pendencias";

export function getServiceClient(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  return createClient(supabaseUrl, serviceRoleKey);
}

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

type ContratoRow = {
  id: string;
  estudante_nome: string | null;
  cancelado_em: string | null;
  created_at: string | null;
  titular_id: string | null;
};
type DocRow = {
  contrato_id: string | null;
  titular_id: string | null;
  tipo_documento: string;
  origem: string | null;
  status: string | null;
  compartilhado_fornecedor: boolean | null;
};

// Associa os documentos a cada contrato e monta a entrada do motor de pendencias.
// Um doc de nivel-titular (contrato_id null) so entra no contrato quando aquele
// titular tem UM unico contrato no conjunto (evita cruzar docs entre contratos).
function montarContratosPendencia(contratos: ContratoRow[], docs: DocRow[]): ContratoPendencia[] {
  const contratosPorTitular = new Map<string, number>();
  for (const c of contratos) {
    if (c.titular_id) contratosPorTitular.set(c.titular_id, (contratosPorTitular.get(c.titular_id) ?? 0) + 1);
  }
  const idsValidos = new Set(contratos.map((c) => c.id));

  const paraDoc = (d: DocRow): DocPendencia => ({
    tipo: d.tipo_documento,
    origem: d.origem ?? null,
    status: d.status ?? null,
    compartilhado: d.compartilhado_fornecedor === true,
  });

  return contratos.map((c) => {
    const docsDoContrato = docs.filter((d) => {
      if (d.contrato_id) return d.contrato_id === c.id && idsValidos.has(d.contrato_id);
      // Nivel-titular: so quando o titular tem exatamente 1 contrato no conjunto.
      return d.titular_id === c.titular_id && (contratosPorTitular.get(c.titular_id ?? "") ?? 0) === 1;
    });
    return {
      contratoId: c.id,
      estudanteNome: c.estudante_nome ?? null,
      canceladoEm: c.cancelado_em ?? null,
      criadoEm: c.created_at ?? null,
      documentos: docsDoContrato.map(paraDoc),
    };
  });
}

// Pendencias (matriz 1-4) de TODOS os contratos do fornecedor. Filtrado sempre
// pelo supplier_id da sessao (isolamento entre escolas).
export async function listarPendenciasDoFornecedor(
  supabase: SupabaseClient,
  supplierId: string
): Promise<Pendencia[]> {
  const { data: contratos } = await supabase
    .from("contratos")
    .select("id, estudante_nome, cancelado_em, created_at, titular_id")
    .eq("supplier_id", supplierId);
  if (!contratos?.length) return [];

  const titularIds = [...new Set(contratos.map((c) => c.titular_id).filter(Boolean))] as string[];
  const { data: docs } = titularIds.length
    ? await supabase
        .from("documentos")
        .select("contrato_id, titular_id, tipo_documento, origem, status, compartilhado_fornecedor")
        .in("titular_id", titularIds)
    : { data: [] as DocRow[] };

  const entrada = montarContratosPendencia(contratos as ContratoRow[], (docs ?? []) as DocRow[]);
  return derivarPendencias(hojeISO(), entrada);
}

// Pendencias de UM contrato do fornecedor (para o selo no detalhe do estudante).
// Reconfere a posse: contrato de outra escola -> lista vazia.
export async function pendenciasDoContratoFornecedor(
  supabase: SupabaseClient,
  supplierId: string,
  contratoId: string
): Promise<Pendencia[]> {
  const { data: contrato } = await supabase
    .from("contratos")
    .select("id, estudante_nome, cancelado_em, created_at, titular_id, supplier_id")
    .eq("id", contratoId)
    .maybeSingle();
  if (!contrato || (contrato as { supplier_id?: string }).supplier_id !== supplierId) return [];

  const c = contrato as ContratoRow & { supplier_id: string };
  const { data: docs } = c.titular_id
    ? await supabase
        .from("documentos")
        .select("contrato_id, titular_id, tipo_documento, origem, status, compartilhado_fornecedor")
        .eq("titular_id", c.titular_id)
    : { data: [] as DocRow[] };

  const entrada = montarContratosPendencia([c], (docs ?? []) as DocRow[]);
  return derivarPendencias(hojeISO(), entrada);
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

export type DocumentoFornecedor = {
  id: string;
  tipoDocumento: string;
  nomeArquivo: string | null;
  origem: string | null;
  status: string | null;
  criadoEm: string | null;
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

// Documentos que o admin COMPARTILHOU com esta escola para ESTE contrato. Dupla
// checagem de posse: (1) o contrato tem que ser do fornecedor da sessao; (2) so
// devolve docs compartilhados e nao-rejeitados. Nada vaza por padrao — o admin
// decide caso a caso no Caso 360 (documentos.compartilhado_fornecedor).
export async function listarDocumentosDoFornecedor(
  supabase: SupabaseClient,
  supplierId: string,
  contratoId: string
): Promise<DocumentoFornecedor[]> {
  // POSSE: confirma que o contrato e desta escola antes de ler qualquer doc.
  const { data: contrato } = await supabase
    .from("contratos")
    .select("id, supplier_id")
    .eq("id", contratoId)
    .maybeSingle();
  if (!contrato || (contrato as { supplier_id?: string }).supplier_id !== supplierId) return [];

  // Visivel a escola: o que o admin compartilhou OU o que a propria escola
  // enviou (origem 'fornecedor'). Nunca os rejeitados.
  const { data } = await supabase
    .from("documentos")
    .select("id, tipo_documento, nome_arquivo, origem, status, created_at")
    .eq("contrato_id", contratoId)
    .or("compartilhado_fornecedor.eq.true,origem.eq.fornecedor")
    // "nao rejeitado": inclui status NULL (o .neq puro excluiria NULL e
    // divergiria do download, que trata NULL como visivel).
    .or("status.is.null,status.neq.rejeitado")
    .order("created_at", { ascending: false });

  return (data ?? []).map((d: any) => ({
    id: d.id,
    tipoDocumento: d.tipo_documento,
    nomeArquivo: d.nome_arquivo ?? null,
    origem: d.origem ?? null,
    status: d.status ?? null,
    criadoEm: d.created_at ?? null,
  }));
}
