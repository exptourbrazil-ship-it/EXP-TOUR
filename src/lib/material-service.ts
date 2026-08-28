// Serviço dos materiais do fornecedor (doc 06 §3.3). SERVER-ONLY (service role).
// REGRA DE OURO: toda consulta filtra por supplier_id da sessão — uma escola só
// vê/edita os próprios materiais.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EntradaMaterial } from "@/lib/material-helpers";

export type Material = {
  id: string;
  tipo: string;
  titulo: string;
  idioma: string;
  programa: string | null;
  validade: string | null;
  permissao: string;
  nomeArquivo: string | null;
  linkUrl: string | null;
  temArquivo: boolean;
  criadoEm: string | null;
};

function mapRow(r: any): Material {
  return {
    id: r.id,
    tipo: r.tipo,
    titulo: r.titulo,
    idioma: r.idioma,
    programa: r.programa ?? null,
    validade: r.validade ?? null,
    permissao: r.permissao,
    nomeArquivo: r.nome_arquivo ?? null,
    linkUrl: r.link_url ?? null,
    temArquivo: !!r.storage_path,
    criadoEm: r.created_at ?? null,
  };
}

const COLS = "id, tipo, titulo, idioma, programa, validade, permissao, nome_arquivo, link_url, storage_path, created_at";

// Lista os materiais ATIVOS (não arquivados) do fornecedor.
export async function listarMateriaisDoFornecedor(supabase: SupabaseClient, supplierId: string): Promise<Material[]> {
  const { data } = await supabase
    .from("material")
    .select(COLS)
    .eq("supplier_id", supplierId)
    .is("archived_at", null)
    .order("created_at", { ascending: false });
  return (data ?? []).map(mapRow);
}

// Cria um material. `arquivo` presente = material por arquivo; senão por link
// (a entrada já foi validada com exigirLink quando não há arquivo). O tenant é
// derivado do PRÓPRIO supplier (nunca do env/slug), para não gravar material com
// tenant errado — o que cruzaria a fronteira multi-tenant na vitrine ao cliente.
export async function criarMaterial(
  supabase: SupabaseClient,
  args: {
    supplierId: string;
    createdBy: string;
    entrada: EntradaMaterial;
    arquivo?: { storagePath: string; nomeArquivo: string; mime: string } | null;
  }
): Promise<{ ok: true; id: string } | { ok: false; erro: string }> {
  const { entrada, arquivo } = args;
  if (!arquivo && !entrada.linkUrl) return { ok: false, erro: "Envie um arquivo ou um link." };

  const { data: sup } = await supabase.from("supplier").select("tenant_id").eq("id", args.supplierId).maybeSingle();
  const tenantId = (sup as { tenant_id?: string } | null)?.tenant_id;
  if (!tenantId) return { ok: false, erro: "Fornecedor sem tenant." };

  const { data, error } = await supabase
    .from("material")
    .insert({
      tenant_id: tenantId,
      supplier_id: args.supplierId,
      tipo: entrada.tipo,
      titulo: entrada.titulo,
      idioma: entrada.idioma,
      programa: entrada.programa,
      validade: entrada.validade,
      permissao: entrada.permissao,
      storage_path: arquivo?.storagePath ?? null,
      nome_arquivo: arquivo?.nomeArquivo ?? null,
      mime: arquivo?.mime ?? null,
      link_url: arquivo ? null : entrada.linkUrl,
      created_by: args.createdBy,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, erro: "Falha ao salvar o material." };
  return { ok: true, id: data.id };
}

// Atualiza SÓ os metadados (não troca o arquivo/link). Posse pelo supplier_id.
export async function atualizarMaterial(
  supabase: SupabaseClient,
  supplierId: string,
  id: string,
  entrada: EntradaMaterial
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const { data, error } = await supabase
    .from("material")
    .update({
      tipo: entrada.tipo,
      titulo: entrada.titulo,
      idioma: entrada.idioma,
      programa: entrada.programa,
      validade: entrada.validade,
      permissao: entrada.permissao,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("supplier_id", supplierId)
    .is("archived_at", null)
    .select("id");
  if (error || !data || data.length === 0) return { ok: false, erro: "Material não encontrado." };
  return { ok: true };
}

// Arquiva (soft delete). Posse pelo supplier_id.
export async function arquivarMaterial(
  supabase: SupabaseClient,
  supplierId: string,
  id: string
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const { data, error } = await supabase
    .from("material")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id)
    .eq("supplier_id", supplierId)
    .is("archived_at", null)
    .select("id");
  if (error || !data || data.length === 0) return { ok: false, erro: "Material não encontrado." };
  return { ok: true };
}

// Dados para o download de um material por ARQUIVO. Posse: só devolve se o
// material for deste fornecedor e não arquivado. Null = nada a servir.
export async function materialParaDownload(
  supabase: SupabaseClient,
  supplierId: string,
  id: string
): Promise<{ storagePath: string; nomeArquivo: string | null } | null> {
  const { data } = await supabase
    .from("material")
    .select("supplier_id, storage_path, nome_arquivo, archived_at")
    .eq("id", id)
    .maybeSingle();
  const row = data as { supplier_id?: string; storage_path?: string | null; nome_arquivo?: string | null; archived_at?: string | null } | null;
  if (!row || row.supplier_id !== supplierId || row.archived_at || !row.storage_path) return null;
  return { storagePath: row.storage_path, nomeArquivo: row.nome_arquivo ?? null };
}
