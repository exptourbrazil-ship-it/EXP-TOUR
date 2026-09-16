// Servico de ESCRITA de CAMPUS (unidade/escola de um fornecedor) pela Area
// Administrativa — hub do fornecedor, aba "Meus Campi". SERVER-ONLY (service
// role): as rotas criam o cliente e o passam como argumento.
//
// POSSE (dupla): tudo escopado pelo tenant vigente E pelo fornecedor da URL. O
// fornecedor tem que ser do tenant; na edicao/arquivamento, o campus tem que ser
// do tenant E daquele fornecedor — nenhum campus muda de fornecedor por aqui.
// A validacao/normalizacao dos campos vem do motor PURO src/lib/campus.ts.
import type { SupabaseClient } from "@supabase/supabase-js";
import { validarCampus, type Falha } from "@/lib/campus";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";

export class CampusAdminErro extends Error {
  constructor(
    public codigo:
      | "validacao"
      | "supplier_invalido"
      | "campus_nao_encontrado"
      | "rascunho_duplicado"
      | "falha_persistir",
    public falhas?: Falha[],
  ) {
    super(codigo);
    this.name = "CampusAdminErro";
  }
}

// Fornecedor do tenant vigente (posse).
async function supplierDoTenant(supabase: SupabaseClient, tenantId: string, supplierId: string): Promise<boolean> {
  const { data } = await supabase
    .from("supplier")
    .select("id")
    .eq("id", supplierId)
    .eq("tenant_id", tenantId)
    .is("archived_at", null)
    .maybeSingle();
  return !!data;
}

// 23505 (unique_violation) SO vira "rascunho duplicado" quando o indice violado e
// de fato o idx_campus_supplier_draft (1 rascunho por fornecedor). Qualquer outro
// unique futuro em campus cai em falha_persistir, sem mascarar a causa.
function ehRascunhoDuplicado(error: { code?: string; message?: string } | null | undefined): boolean {
  return !!error && error.code === "23505" && (error.message ?? "").includes("idx_campus_supplier_draft");
}

export type SalvarCampusArgs = {
  tenantId: string;
  supplierId: string; // fornecedor da URL do hub (dono do campus)
  actor: string; // usuario admin (auditoria)
  ip?: string | null;
  campusId?: string | null; // ausente = criar; presente = editar
  entrada: unknown; // corpo cru (validado pelo motor)
};

// Cria ou edita um campus do fornecedor e grava a trilha. Devolve o id.
export async function salvarCampusAdmin(
  supabase: SupabaseClient,
  args: SalvarCampusArgs,
): Promise<{ id: string; criado: boolean }> {
  const { tenantId, supplierId, actor, ip, campusId } = args;

  const r = validarCampus(args.entrada);
  if (!r.ok) throw new CampusAdminErro("validacao", r.falhas);
  const c = r.valor;

  if (!(await supplierDoTenant(supabase, tenantId, supplierId))) {
    throw new CampusAdminErro("supplier_invalido");
  }

  const linha = {
    name: c.name,
    country_code: c.country_code,
    region: c.region,
    city: c.city,
    address: c.address,
    postal_code: c.postal_code,
    timezone: c.timezone,
    base_currency: c.base_currency,
    phone: c.phone,
    email: c.email,
    website: c.website,
    status: c.status,
  };

  let id: string;
  let criado: boolean;

  if (campusId) {
    // Edicao: o campus tem que ser do tenant E deste fornecedor.
    const { data: existente } = await supabase
      .from("campus")
      .select("id")
      .eq("id", campusId)
      .eq("tenant_id", tenantId)
      .eq("supplier_id", supplierId)
      .is("archived_at", null)
      .maybeSingle();
    if (!existente) throw new CampusAdminErro("campus_nao_encontrado");

    const { data: upd, error } = await supabase
      .from("campus")
      .update({ ...linha, updated_at: new Date().toISOString() })
      .eq("id", campusId)
      .eq("tenant_id", tenantId)
      .eq("supplier_id", supplierId) // guarda extra de posse
      .select("id");
    if (error) {
      if (ehRascunhoDuplicado(error)) throw new CampusAdminErro("rascunho_duplicado");
      console.error("[campus] atualizar:", error.message);
      throw new CampusAdminErro("falha_persistir");
    }
    if (!upd || upd.length === 0) throw new CampusAdminErro("campus_nao_encontrado");
    id = campusId;
    criado = false;
  } else {
    const { data, error } = await supabase
      .from("campus")
      .insert({ tenant_id: tenantId, supplier_id: supplierId, ...linha })
      .select("id")
      .single();
    if (error || !data) {
      if (ehRascunhoDuplicado(error)) throw new CampusAdminErro("rascunho_duplicado");
      if (error) console.error("[campus] criar:", error.message);
      throw new CampusAdminErro("falha_persistir");
    }
    id = (data as { id: string }).id;
    criado = true;
  }

  await registrarAuditoriaAdmin(supabase, {
    usuario: actor,
    acao: criado ? "campus.criar" : "campus.editar",
    alvo: id,
    detalhe: { supplier_id: supplierId, name: c.name, city: c.city, country_code: c.country_code, status: c.status },
    ip: ip ?? null,
  });

  return { id, criado };
}

// Arquiva (soft-delete) um campus do fornecedor. Confere posse dupla. IDEMPOTENTE:
// arquivar de novo um campus ja arquivado (deste fornecedor) e sucesso silencioso.
// Nao apaga: produtos/precos pendurados no campus continuam existindo — mas os
// checks de posse de produto/taxa/preco/promocao/conteudo passam a RECUSAR campus
// arquivado como alvo (archived_at is null), entao nada novo nasce sob ele.
// PENDENCIA: nao ha caminho de reativacao na UI (rota/"Arquivados" futura).
export async function arquivarCampusAdmin(
  supabase: SupabaseClient,
  args: { tenantId: string; supplierId: string; actor: string; ip?: string | null; campusId: string },
): Promise<void> {
  const { tenantId, supplierId, actor, ip, campusId } = args;
  const agora = new Date().toISOString();
  const { data: upd, error } = await supabase
    .from("campus")
    .update({ archived_at: agora, status: "inactive", updated_at: agora })
    .eq("id", campusId)
    .eq("tenant_id", tenantId)
    .eq("supplier_id", supplierId)
    .is("archived_at", null)
    .select("id");
  if (error) {
    console.error("[campus] arquivar:", error.message);
    throw new CampusAdminErro("falha_persistir");
  }
  if (!upd || upd.length === 0) {
    // 0 linhas: ou ja estava arquivado (idempotente -> ok) ou nao e deste fornecedor/tenant.
    const { data: jaArquivado } = await supabase
      .from("campus")
      .select("id")
      .eq("id", campusId)
      .eq("tenant_id", tenantId)
      .eq("supplier_id", supplierId)
      .not("archived_at", "is", null)
      .maybeSingle();
    if (jaArquivado) return;
    throw new CampusAdminErro("campus_nao_encontrado");
  }

  await registrarAuditoriaAdmin(supabase, {
    usuario: actor,
    acao: "campus.arquivar",
    alvo: campusId,
    detalhe: { supplier_id: supplierId },
    ip: ip ?? null,
  });
}

// ── Leitura para o editor ───────────────────────────────────────────────────

export type CampusAdmin = {
  id: string;
  name: string;
  country_code: string;
  region: string | null;
  city: string;
  address: string | null;
  postal_code: string | null;
  timezone: string;
  base_currency: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  status: string;
};

// Campus do tenant E do fornecedor (posse dupla). null se nao for dele.
export async function obterCampusAdmin(
  supabase: SupabaseClient,
  tenantId: string,
  supplierId: string,
  campusId: string,
): Promise<CampusAdmin | null> {
  const { data } = await supabase
    .from("campus")
    .select("id, name, country_code, region, city, address, postal_code, timezone, base_currency, phone, email, website, status")
    .eq("id", campusId)
    .eq("tenant_id", tenantId)
    .eq("supplier_id", supplierId)
    .is("archived_at", null)
    .maybeSingle();
  return (data as CampusAdmin | null) ?? null;
}
