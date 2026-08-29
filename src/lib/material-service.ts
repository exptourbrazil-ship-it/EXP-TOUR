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

// ── Área do Cliente ─────────────────────────────────────────────────────────
// Materiais que a escola marcou como EXPOSTOS AO CLIENTE (permissao='cliente'),
// ativos e NÃO vencidos. Filtrado pelo supplier do contrato do cliente.
export async function listarMateriaisCliente(supabase: SupabaseClient, supplierId: string, hojeISO: string): Promise<Material[]> {
  const { data } = await supabase
    .from("material")
    .select(COLS)
    .eq("supplier_id", supplierId)
    .eq("permissao", "cliente")
    .is("archived_at", null)
    .or(`validade.is.null,validade.gte.${hojeISO}`)
    .order("created_at", { ascending: false });
  return (data ?? []).map(mapRow);
}

// Download de material pelo CLIENTE: só arquivo de material 'cliente', ativo e
// não vencido, do supplier informado (o do contrato do cliente).
export async function materialClienteParaDownload(
  supabase: SupabaseClient,
  supplierId: string,
  id: string,
  hojeISO: string
): Promise<{ storagePath: string; nomeArquivo: string | null } | null> {
  const { data } = await supabase
    .from("material")
    .select("supplier_id, permissao, storage_path, nome_arquivo, archived_at, validade")
    .eq("id", id)
    .maybeSingle();
  const r = data as { supplier_id?: string; permissao?: string; storage_path?: string | null; nome_arquivo?: string | null; archived_at?: string | null; validade?: string | null } | null;
  if (!r || r.supplier_id !== supplierId || r.permissao !== "cliente" || r.archived_at || !r.storage_path) return null;
  if (r.validade && String(r.validade) < hojeISO) return null; // vencido sai de circulação
  return { storagePath: r.storage_path, nomeArquivo: r.nome_arquivo ?? null };
}

// ── Admin (consultores) ─────────────────────────────────────────────────────
export type MaterialAdmin = Material & { supplierId: string; supplierNome: string | null; vencido: boolean };

// Biblioteca de materiais para o admin (do tenant), opcionalmente filtrada por
// fornecedor. Ativos (não arquivados). Marca os vencidos.
export async function listarMateriaisAdmin(
  supabase: SupabaseClient,
  tenantId: string,
  hojeISO: string,
  supplierId?: string
): Promise<MaterialAdmin[]> {
  let q = supabase
    .from("material")
    .select(COLS + ", supplier_id, supplier:supplier(display_name)")
    .eq("tenant_id", tenantId)
    .is("archived_at", null)
    .order("created_at", { ascending: false });
  if (supplierId) q = q.eq("supplier_id", supplierId);
  const { data } = await q;
  return (data ?? []).map((r: any) => {
    const sup = Array.isArray(r.supplier) ? r.supplier[0] : r.supplier;
    return {
      ...mapRow(r),
      supplierId: r.supplier_id,
      supplierNome: sup?.display_name ?? null,
      vencido: !!r.validade && String(r.validade) < hojeISO,
    };
  });
}

// Materiais para anexar a uma COTAÇÃO (doc 06 §3.3): resolve a(s) escola(s) do
// quote pelos campi dos itens (quote_item.campus_id, ou product.campus_id) e
// devolve os materiais 'cliente', ativos e NÃO vencidos dessas escolas — a
// brochura certa "automaticamente". Escopo por tenant. Brochura primeiro.
export async function materiaisParaCotacao(
  supabase: SupabaseClient,
  tenantId: string,
  quoteId: string,
  hojeISO: string
): Promise<MaterialAdmin[]> {
  const { data: opts } = await supabase.from("quote_option").select("id").eq("tenant_id", tenantId).eq("quote_id", quoteId);
  const optIds = (opts ?? []).map((o: any) => o.id);
  if (!optIds.length) return [];

  const { data: items } = await supabase.from("quote_item").select("campus_id, product_id").eq("tenant_id", tenantId).in("quote_option_id", optIds);
  const campusIds = new Set<string>();
  const productIds = new Set<string>();
  for (const it of (items ?? []) as any[]) {
    if (it.campus_id) campusIds.add(it.campus_id);
    else if (it.product_id) productIds.add(it.product_id);
  }
  if (productIds.size) {
    const { data: prods } = await supabase.from("product").select("campus_id").in("id", [...productIds]);
    for (const p of (prods ?? []) as any[]) if (p.campus_id) campusIds.add(p.campus_id);
  }
  if (!campusIds.size) return [];

  const { data: campuses } = await supabase.from("campus").select("supplier_id").in("id", [...campusIds]);
  const supplierIds = [...new Set((campuses ?? []).map((c: any) => c.supplier_id).filter(Boolean))] as string[];
  if (!supplierIds.length) return [];

  const vistos = new Set<string>();
  const out: MaterialAdmin[] = [];
  for (const sid of supplierIds) {
    for (const m of await listarMateriaisAdmin(supabase, tenantId, hojeISO, sid)) {
      if (m.permissao !== "cliente" || m.vencido || vistos.has(m.id)) continue;
      vistos.add(m.id);
      out.push(m);
    }
  }
  // Brochura primeiro (é o que normalmente vai à proposta).
  out.sort((a, b) => (a.tipo === "brochura" ? -1 : 0) - (b.tipo === "brochura" ? -1 : 0));
  return out;
}

// Download de material pelo ADMIN: posse por tenant (materiais são do tenant).
export async function materialAdminParaDownload(
  supabase: SupabaseClient,
  tenantId: string,
  id: string
): Promise<{ storagePath: string; nomeArquivo: string | null } | null> {
  const { data } = await supabase
    .from("material")
    .select("tenant_id, storage_path, nome_arquivo, archived_at")
    .eq("id", id)
    .maybeSingle();
  const r = data as { tenant_id?: string; storage_path?: string | null; nome_arquivo?: string | null; archived_at?: string | null } | null;
  if (!r || r.tenant_id !== tenantId || r.archived_at || !r.storage_path) return null;
  return { storagePath: r.storage_path, nomeArquivo: r.nome_arquivo ?? null };
}

// ── Cron de validade ────────────────────────────────────────────────────────
export type MaterialVencido = { id: string; supplierId: string; titulo: string; validade: string | null };

// Materiais ATIVOS já vencidos (validade < hoje), para o cron avisar a escola.
export async function materiaisVencidos(supabase: SupabaseClient, hojeISO: string): Promise<MaterialVencido[]> {
  const { data } = await supabase
    .from("material")
    .select("id, supplier_id, titulo, validade")
    .is("archived_at", null)
    .not("validade", "is", null)
    .lt("validade", hojeISO);
  return (data ?? []).map((r: any) => ({ id: r.id, supplierId: r.supplier_id, titulo: r.titulo, validade: r.validade ?? null }));
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
