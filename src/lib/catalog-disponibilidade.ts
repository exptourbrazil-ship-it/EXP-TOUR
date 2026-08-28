// Servico da Disponibilidade (Portal do Fornecedor / admin). SERVER-ONLY
// (service role). Ancorado no catalogo estilo Edvisor: supplier -> campus ->
// product(kind='program') -> product_availability (intakes).
//
// POSSE: toda operacao e escopada pelo supplierId (a escola da sessao no portal,
// ou o fornecedor escolhido no admin, ai gateado por capacidade). Nenhuma escola
// enxerga/edita o catalogo de outra: as escritas conferem product->campus->supplier.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { IntakeDados, ProgramaDados, StatusIntake } from "@/lib/disponibilidade";

export type Programa = {
  id: string;
  name: string;
  status: string | null;
  language: string | null;
  educationType: string | null;
  minDuration: number | null;
  maxDuration: number | null;
};

export type Intake = {
  id: string;
  startDate: string;
  status: StatusIntake;
  capacity: number | null;
  notes: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
};

export type ActorKind = "supplier" | "admin";

// Campus do fornecedor: retorna o primeiro; se nao houver, cria um "principal"
// (rascunho) a partir do supplier — placeholders que a escola/admin completam
// depois (cidade/timezone/moeda). Isso da onde pendurar os programas na hora.
export async function garantirCampusDoFornecedor(
  supabase: SupabaseClient,
  supplierId: string,
  tenantId: string
): Promise<string> {
  const { data: existente } = await supabase
    .from("campus")
    .select("id")
    .eq("supplier_id", supplierId)
    .is("archived_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (existente?.id) return existente.id as string;

  const { data: sup } = await supabase
    .from("supplier")
    .select("display_name, country_code")
    .eq("id", supplierId)
    .maybeSingle();

  const country = (sup as { country_code?: string | null } | null)?.country_code;
  const { data: criado, error } = await supabase
    .from("campus")
    .insert({
      tenant_id: tenantId,
      supplier_id: supplierId,
      name: (sup as { display_name?: string } | null)?.display_name || "Unidade principal",
      country_code: country && /^[A-Za-z]{2}$/.test(country) ? country.toUpperCase() : "ZZ",
      city: "(a definir)",
      timezone: "UTC",
      base_currency: "USD",
      status: "draft",
    })
    .select("id")
    .single();
  if (error || !criado) {
    throw new Error(`Falha ao provisionar o campus do fornecedor: ${error?.message ?? "sem retorno"}`);
  }
  return criado.id as string;
}

async function campusIdsDoFornecedor(supabase: SupabaseClient, supplierId: string): Promise<string[]> {
  const { data } = await supabase.from("campus").select("id").eq("supplier_id", supplierId).is("archived_at", null);
  return (data ?? []).map((c) => (c as { id: string }).id);
}

// Confere que um product pertence a um campus do fornecedor (posse). Retorna o
// campus_id quando pertence, ou null.
async function productDoFornecedor(
  supabase: SupabaseClient,
  supplierId: string,
  productId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("product")
    .select("id, campus_id, campus:campus(supplier_id)")
    .eq("id", productId)
    .maybeSingle();
  if (!data) return null;
  const campus = (data as any).campus;
  const donoId = Array.isArray(campus) ? campus[0]?.supplier_id : campus?.supplier_id;
  return donoId === supplierId ? ((data as any).campus_id as string) : null;
}

// Lista os programas (product kind='program') do fornecedor.
export async function listarProgramas(supabase: SupabaseClient, supplierId: string): Promise<Programa[]> {
  const campusIds = await campusIdsDoFornecedor(supabase, supplierId);
  if (campusIds.length === 0) return [];
  const { data } = await supabase
    .from("product")
    .select("id, name, status, min_duration, max_duration, detail:program_detail(language, education_type)")
    .in("campus_id", campusIds)
    .eq("kind", "program")
    .is("archived_at", null)
    .order("name");

  return (data ?? []).map((p: any) => {
    const det = Array.isArray(p.detail) ? p.detail[0] : p.detail;
    return {
      id: p.id,
      name: p.name,
      status: p.status ?? null,
      language: det?.language ?? null,
      educationType: det?.education_type ?? null,
      minDuration: p.min_duration ?? null,
      maxDuration: p.max_duration ?? null,
    };
  });
}

export type ProgramaComIntakes = Programa & { intakes: Intake[] };

// Programas do fornecedor JA com seus intakes (para as telas). Uma consulta de
// programas + uma de intakes (agrupada em memoria).
export async function listarProgramasComIntakes(
  supabase: SupabaseClient,
  supplierId: string
): Promise<ProgramaComIntakes[]> {
  const programas = await listarProgramas(supabase, supplierId);
  if (programas.length === 0) return [];
  const ids = programas.map((p) => p.id);
  const { data } = await supabase
    .from("product_availability")
    .select("id, product_id, start_date, status, capacity, notes, updated_by, updated_at")
    .in("product_id", ids)
    .order("start_date");
  const porProduto = new Map<string, Intake[]>();
  for (const r of (data ?? []) as any[]) {
    const arr = porProduto.get(r.product_id) ?? [];
    arr.push({
      id: r.id,
      startDate: r.start_date,
      status: r.status,
      capacity: r.capacity ?? null,
      notes: r.notes ?? null,
      updatedBy: r.updated_by ?? null,
      updatedAt: r.updated_at ?? null,
    });
    porProduto.set(r.product_id, arr);
  }
  return programas.map((p) => ({ ...p, intakes: porProduto.get(p.id) ?? [] }));
}

// Cria um programa (self-service da escola). source='supplier'.
export async function criarPrograma(
  supabase: SupabaseClient,
  supplierId: string,
  tenantId: string,
  dados: ProgramaDados
): Promise<string> {
  const campusId = await garantirCampusDoFornecedor(supabase, supplierId, tenantId);
  const { data: prod, error } = await supabase
    .from("product")
    .insert({
      tenant_id: tenantId,
      campus_id: campusId,
      kind: "program",
      name: dados.name,
      source: "supplier",
      visibility: "internal",
      status: "active",
      default_unit: "week",
      min_duration: dados.minDuration,
      max_duration: dados.maxDuration,
    })
    .select("id")
    .single();
  if (error || !prod) throw new Error(`Falha ao criar o programa: ${error?.message ?? "sem retorno"}`);

  // program_detail (idioma/tipo). Best-effort: o programa ja existe mesmo se falhar.
  await supabase.from("program_detail").upsert(
    { product_id: prod.id, language: dados.language, education_type: dados.educationType },
    { onConflict: "product_id" }
  );
  return prod.id as string;
}

// Arquiva um programa (soft-delete), conferindo a posse.
export async function arquivarPrograma(
  supabase: SupabaseClient,
  supplierId: string,
  productId: string
): Promise<boolean> {
  const campusId = await productDoFornecedor(supabase, supplierId, productId);
  if (!campusId) return false;
  await supabase.from("product").update({ archived_at: new Date().toISOString() }).eq("id", productId);
  return true;
}

// Lista os intakes (datas de inicio) de um programa do fornecedor.
export async function listarIntakes(
  supabase: SupabaseClient,
  supplierId: string,
  productId: string
): Promise<Intake[]> {
  const campusId = await productDoFornecedor(supabase, supplierId, productId);
  if (!campusId) return [];
  const { data } = await supabase
    .from("product_availability")
    .select("id, start_date, status, capacity, notes, updated_by, updated_at")
    .eq("product_id", productId)
    .order("start_date");
  return (data ?? []).map((r: any) => ({
    id: r.id,
    startDate: r.start_date,
    status: r.status,
    capacity: r.capacity ?? null,
    notes: r.notes ?? null,
    updatedBy: r.updated_by ?? null,
    updatedAt: r.updated_at ?? null,
  }));
}

// Cria/atualiza um intake (publica na hora) + grava a trilha. Confere a posse.
export async function salvarIntake(
  supabase: SupabaseClient,
  supplierId: string,
  tenantId: string,
  productId: string,
  dados: IntakeDados,
  actor: string,
  actorKind: ActorKind
): Promise<{ ok: boolean; erro?: string }> {
  const campusId = await productDoFornecedor(supabase, supplierId, productId);
  if (!campusId) return { ok: false, erro: "Programa não encontrado." };

  const { error } = await supabase.from("product_availability").upsert(
    {
      tenant_id: tenantId,
      product_id: productId,
      start_date: dados.startDate,
      status: dados.status,
      capacity: dados.capacity,
      notes: dados.notes,
      updated_by: actor,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "product_id,start_date" }
  );
  if (error) return { ok: false, erro: "Falha ao salvar a disponibilidade." };

  await supabase.from("product_availability_log").insert({
    tenant_id: tenantId,
    product_id: productId,
    start_date: dados.startDate,
    action: "upsert",
    status: dados.status,
    capacity: dados.capacity,
    actor,
    actor_kind: actorKind,
  });
  return { ok: true };
}

// Remove um intake + grava a trilha. Confere a posse.
export async function removerIntake(
  supabase: SupabaseClient,
  supplierId: string,
  tenantId: string,
  productId: string,
  startDate: string,
  actor: string,
  actorKind: ActorKind
): Promise<{ ok: boolean; erro?: string }> {
  const campusId = await productDoFornecedor(supabase, supplierId, productId);
  if (!campusId) return { ok: false, erro: "Programa não encontrado." };

  await supabase.from("product_availability").delete().eq("product_id", productId).eq("start_date", startDate);
  await supabase.from("product_availability_log").insert({
    tenant_id: tenantId,
    product_id: productId,
    start_date: startDate,
    action: "delete",
    actor,
    actor_kind: actorKind,
  });
  return { ok: true };
}
