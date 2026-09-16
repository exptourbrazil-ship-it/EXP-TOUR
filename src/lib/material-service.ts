// Serviço dos materiais do fornecedor (doc 06 §3.3). SERVER-ONLY (service role).
// REGRA DE OURO: toda consulta do portal filtra por supplier_id da sessão — uma
// escola só vê/edita os próprios materiais.
//
// APROVAÇÃO (F2): "a IA audita, o humano publica". Fornecedor sobe -> 'pendente';
// admin publica ('aprovado') ou recusa ('rejeitado' + motivo); admin sobe direto
// -> 'aprovado'. Editar metadados de um material já publicado (pelo fornecedor)
// devolve-o a 'pendente'. SÓ 'aprovado' alcança cliente e cotação (gate abaixo).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EntradaMaterial } from "@/lib/material-helpers";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";

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
  status: string; // pendente | aprovado | rejeitado
  motivoRejeicao: string | null;
  submittedBy: string | null;
  // Versao do registro (updated_at): o admin publica/recusa a versao que VIU
  // (guarda otimista) — se o fornecedor editar no meio, a acao falha fechada.
  atualizadoEm: string | null;
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
    status: r.status ?? "aprovado",
    motivoRejeicao: r.motivo_rejeicao ?? null,
    submittedBy: r.submitted_by ?? null,
    atualizadoEm: r.updated_at ?? null,
  };
}

const COLS =
  "id, tipo, titulo, idioma, programa, validade, permissao, nome_arquivo, link_url, storage_path, created_at, status, motivo_rejeicao, submitted_by, updated_at";

// Lista os materiais ATIVOS (não arquivados) do fornecedor — todos os status, para
// a escola acompanhar o que está pendente/recusado.
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
// `origem`: 'fornecedor' nasce PENDENTE (aguarda o admin); 'admin' nasce APROVADO.
export async function criarMaterial(
  supabase: SupabaseClient,
  args: {
    supplierId: string;
    createdBy: string;
    origem: "fornecedor" | "admin";
    entrada: EntradaMaterial;
    arquivo?: { storagePath: string; nomeArquivo: string; mime: string } | null;
  }
): Promise<{ ok: true; id: string } | { ok: false; erro: string }> {
  const { entrada, arquivo } = args;
  if (!arquivo && !entrada.linkUrl) return { ok: false, erro: "Envie um arquivo ou um link." };

  const { data: sup } = await supabase.from("supplier").select("tenant_id").eq("id", args.supplierId).maybeSingle();
  const tenantId = (sup as { tenant_id?: string } | null)?.tenant_id;
  if (!tenantId) return { ok: false, erro: "Fornecedor sem tenant." };

  const agora = new Date().toISOString();
  const aprovadoDireto = args.origem === "admin";
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
      submitted_by: args.createdBy,
      status: aprovadoDireto ? "aprovado" : "pendente",
      aprovado_por: aprovadoDireto ? args.createdBy : null,
      aprovado_em: aprovadoDireto ? agora : null,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, erro: "Falha ao salvar o material." };
  return { ok: true, id: data.id };
}

// Atualiza SÓ os metadados (não troca o arquivo/link). Posse pelo supplier_id.
// Como é o FORNECEDOR editando, o material volta a 'pendente' (limpa a aprovação
// anterior): nada muda no que está publicado sem passar de novo pelo crivo.
export async function atualizarMaterial(
  supabase: SupabaseClient,
  supplierId: string,
  id: string,
  entrada: EntradaMaterial,
  submittedBy?: string | null,
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
      status: "pendente",
      submitted_by: submittedBy ?? null,
      aprovado_por: null,
      aprovado_em: null,
      rejeitado_por: null,
      rejeitado_em: null,
      motivo_rejeicao: null,
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
// APROVADOS pelo admin, ativos e NÃO vencidos. Filtrado pelo supplier do contrato.
export async function listarMateriaisCliente(supabase: SupabaseClient, supplierId: string, hojeISO: string): Promise<Material[]> {
  const { data } = await supabase
    .from("material")
    .select(COLS)
    .eq("supplier_id", supplierId)
    .eq("permissao", "cliente")
    .eq("status", "aprovado")
    .is("archived_at", null)
    .or(`validade.is.null,validade.gte.${hojeISO}`)
    .order("created_at", { ascending: false });
  return (data ?? []).map(mapRow);
}

// Download de material pelo CLIENTE: só arquivo de material 'cliente', APROVADO,
// ativo e não vencido, do supplier informado (o do contrato do cliente).
export async function materialClienteParaDownload(
  supabase: SupabaseClient,
  supplierId: string,
  id: string,
  hojeISO: string
): Promise<{ storagePath: string; nomeArquivo: string | null } | null> {
  const { data } = await supabase
    .from("material")
    .select("supplier_id, permissao, status, storage_path, nome_arquivo, archived_at, validade")
    .eq("id", id)
    .maybeSingle();
  const r = data as {
    supplier_id?: string; permissao?: string; status?: string; storage_path?: string | null;
    nome_arquivo?: string | null; archived_at?: string | null; validade?: string | null;
  } | null;
  if (!r || r.supplier_id !== supplierId || r.permissao !== "cliente" || r.status !== "aprovado" || r.archived_at || !r.storage_path) return null;
  if (r.validade && String(r.validade) < hojeISO) return null; // vencido sai de circulação
  return { storagePath: r.storage_path, nomeArquivo: r.nome_arquivo ?? null };
}

// ── Admin (consultores) ─────────────────────────────────────────────────────
export type MaterialAdmin = Material & { supplierId: string; supplierNome: string | null; vencido: boolean };

// Biblioteca de materiais para o admin (do tenant), opcionalmente filtrada por
// fornecedor. Ativos (não arquivados), TODOS os status (a fila de aprovação vive
// aqui). Marca os vencidos.
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
// devolve os materiais 'cliente', APROVADOS, ativos e NÃO vencidos dessas escolas
// — a brochura certa "automaticamente". Escopo por tenant. Brochura primeiro.
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
      if (m.permissao !== "cliente" || m.status !== "aprovado" || m.vencido || vistos.has(m.id)) continue;
      vistos.add(m.id);
      out.push(m);
    }
  }
  // Brochura primeiro (é o que normalmente vai à proposta).
  out.sort((a, b) => (a.tipo === "brochura" ? -1 : 0) - (b.tipo === "brochura" ? -1 : 0));
  return out;
}

// Download de material pelo ADMIN: posse por tenant (materiais são do tenant).
// Qualquer status — o admin precisa abrir o pendente para revisar.
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

// ── Admin: aprovação e upload direto (F2) ───────────────────────────────────
type ResultadoAdmin = { ok: true } | { ok: false; erro: string };

// Guarda otimista de VERSAO (achado M1 da revisao): `vistoEm` e o updated_at que
// o admin tinha na tela ao revisar. undefined = chamador legado, sem guarda;
// string = tem que bater; null = o registro nunca foi atualizado (IS NULL).
// Fecha a corrida em que o fornecedor edita metadados (ex.: interno -> cliente)
// entre a revisao e o clique — o admin so publica o que de fato viu. Aplicada
// inline em aprovar/rejeitar (os filtros do builder devolvem o mesmo tipo).

// Explica um update de 0 linhas: ainda pendente (=> mudou de versao) ou nao pendente.
async function motivoZeroLinhas(supabase: SupabaseClient, tenantId: string, id: string): Promise<string> {
  const { data } = await supabase
    .from("material")
    .select("status")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .is("archived_at", null)
    .maybeSingle();
  if (data && (data as { status?: string }).status === "pendente") {
    return "O material foi alterado pelo fornecedor depois da sua revisão — recarregue a página e revise a versão nova.";
  }
  return "Este material não está aguardando aprovação.";
}

// Publica um material PENDENTE do tenant — a versao que o admin viu (vistoEm).
export async function aprovarMaterialAdmin(
  supabase: SupabaseClient,
  tenantId: string,
  id: string,
  actor: string,
  ip?: string | null,
  vistoEm?: string | null,
): Promise<ResultadoAdmin> {
  const agora = new Date().toISOString();
  let q = supabase
    .from("material")
    .update({ status: "aprovado", aprovado_por: actor, aprovado_em: agora, rejeitado_por: null, rejeitado_em: null, motivo_rejeicao: null, updated_at: agora })
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .eq("status", "pendente")
    .is("archived_at", null);
  if (vistoEm !== undefined) q = vistoEm === null ? q.is("updated_at", null) : q.eq("updated_at", vistoEm);
  const { data, error } = await q.select("id, supplier_id, titulo");
  if (error) return { ok: false, erro: "Falha ao aprovar o material." };
  if (!data || data.length === 0) return { ok: false, erro: await motivoZeroLinhas(supabase, tenantId, id) };
  await registrarAuditoriaAdmin(supabase, {
    usuario: actor,
    acao: "fornecedores.material.aprovar",
    alvo: id,
    detalhe: { supplier_id: (data[0] as any).supplier_id, titulo: (data[0] as any).titulo },
    ip: ip ?? null,
  });
  return { ok: true };
}

// Recusa um material PENDENTE com motivo (o fornecedor lê no portal) — a versao
// que o admin viu (vistoEm).
export async function rejeitarMaterialAdmin(
  supabase: SupabaseClient,
  tenantId: string,
  id: string,
  actor: string,
  motivo: string,
  ip?: string | null,
  vistoEm?: string | null,
): Promise<ResultadoAdmin> {
  const agora = new Date().toISOString();
  let q = supabase
    .from("material")
    .update({ status: "rejeitado", rejeitado_por: actor, rejeitado_em: agora, motivo_rejeicao: motivo, updated_at: agora })
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .eq("status", "pendente")
    .is("archived_at", null);
  if (vistoEm !== undefined) q = vistoEm === null ? q.is("updated_at", null) : q.eq("updated_at", vistoEm);
  const { data, error } = await q.select("id, supplier_id, titulo");
  if (error) return { ok: false, erro: "Falha ao recusar o material." };
  if (!data || data.length === 0) return { ok: false, erro: await motivoZeroLinhas(supabase, tenantId, id) };
  await registrarAuditoriaAdmin(supabase, {
    usuario: actor,
    acao: "fornecedores.material.rejeitar",
    alvo: id,
    detalhe: { supplier_id: (data[0] as any).supplier_id, titulo: (data[0] as any).titulo, motivo },
    ip: ip ?? null,
  });
  return { ok: true };
}

// Arquiva (soft delete) um material do tenant pelo admin (qualquer status).
export async function arquivarMaterialAdmin(
  supabase: SupabaseClient,
  tenantId: string,
  id: string,
  actor: string,
  ip?: string | null,
): Promise<ResultadoAdmin> {
  const { data, error } = await supabase
    .from("material")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .is("archived_at", null)
    .select("id, supplier_id");
  if (error) return { ok: false, erro: "Falha ao arquivar o material." };
  if (!data || data.length === 0) return { ok: false, erro: "Material não encontrado." };
  await registrarAuditoriaAdmin(supabase, {
    usuario: actor,
    acao: "fornecedores.material.arquivar",
    alvo: id,
    detalhe: { supplier_id: (data[0] as any).supplier_id },
    ip: ip ?? null,
  });
  return { ok: true };
}

// Upload direto pelo ADMIN (material que a equipe já tem ou recebeu por fora):
// nasce APROVADO. Posse: o fornecedor tem que ser do tenant vigente.
export async function criarMaterialAdmin(
  supabase: SupabaseClient,
  args: {
    tenantId: string;
    supplierId: string;
    actor: string;
    ip?: string | null;
    entrada: EntradaMaterial;
    arquivo?: { storagePath: string; nomeArquivo: string; mime: string } | null;
  }
): Promise<{ ok: true; id: string } | { ok: false; erro: string }> {
  const { data: sup } = await supabase
    .from("supplier")
    .select("id")
    .eq("id", args.supplierId)
    .eq("tenant_id", args.tenantId)
    .is("archived_at", null)
    .maybeSingle();
  if (!sup) return { ok: false, erro: "Fornecedor não encontrado neste tenant." };

  const r = await criarMaterial(supabase, {
    supplierId: args.supplierId,
    createdBy: args.actor,
    origem: "admin",
    entrada: args.entrada,
    arquivo: args.arquivo ?? null,
  });
  if (!r.ok) return r;
  await registrarAuditoriaAdmin(supabase, {
    usuario: args.actor,
    acao: "fornecedores.material.criar",
    alvo: r.id,
    detalhe: { supplier_id: args.supplierId, tipo: args.entrada.tipo, titulo: args.entrada.titulo, permissao: args.entrada.permissao },
    ip: args.ip ?? null,
  });
  return r;
}

// ── Cron de validade ────────────────────────────────────────────────────────
export type MaterialVencido = { id: string; supplierId: string; titulo: string; validade: string | null };

// Materiais ATIVOS já vencidos (validade < hoje), para o cron avisar a escola.
export async function materiaisVencidos(
  supabase: SupabaseClient,
  hojeISO: string,
  tenantId?: string,
): Promise<MaterialVencido[]> {
  // Multi-tenant: quando o cron passa o tenant do deploy, escopa por tenant_id
  // (material tem tenant_id direto) para os dois deploys nao processarem os
  // materiais um do outro. tenantId ausente => sem filtro (compatibilidade).
  let q = supabase
    .from("material")
    .select("id, supplier_id, titulo, validade")
    .is("archived_at", null)
    .not("validade", "is", null)
    .lt("validade", hojeISO);
  if (tenantId) q = q.eq("tenant_id", tenantId);
  const { data } = await q;
  return (data ?? []).map((r: any) => ({ id: r.id, supplierId: r.supplier_id, titulo: r.titulo, validade: r.validade ?? null }));
}

// Dados para o download de um material por ARQUIVO (portal do fornecedor). Posse:
// só devolve se o material for deste fornecedor e não arquivado. Null = nada a servir.
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
