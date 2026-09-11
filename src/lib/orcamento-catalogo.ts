// NB: modulo server-only (service role). Carrega o catalogo PRECIFICAVEL para o
// orcamento lead-facing (Forio Marketplace) + a cotacao do dia por moeda.
// Monta os `ProgramaOrcavel` (nucleo puro em src/lib/orcamento.ts) lendo os
// produtos quotable, suas tabelas de preco (tuition), taxas (matricula/material)
// e os produtos de acomodacao/seguro por campus.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { tenantIdAtual } from "@/lib/catalog-service";
import { hojeBrasilISO } from "@/lib/admin-financeiro";
import type { ProgramaOrcavel, AcomodacaoPrecos } from "@/lib/orcamento";

function getSupabase(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );
}

// country_code (char2) -> rotulo usado na UI + bandeira.
const PAIS_LABEL: Record<string, string> = { GB: "UK", MT: "Malta", US: "US", CA: "Canada", NZ: "New Zealand", IE: "Ireland" };
const PAIS_FLAG: Record<string, string> = { GB: "🇬🇧", MT: "🇲🇹", US: "🇺🇸", CA: "🇨🇦", NZ: "🇳🇿", IE: "🇮🇪" };

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const num = (v: unknown) => (v == null ? 0 : Number(v) || 0);

// Normaliza uma URL de site (garante protocolo). Vazio/invalido -> null.
function normalizarUrl(u: string | null | undefined): string | null {
  const s = (u ?? "").trim();
  if (!s) return null;
  return /^https?:\/\//i.test(s) ? s : `https://${s.replace(/^\/+/, "")}`;
}

export type CatalogoOrcamento = {
  programas: ProgramaOrcavel[];
  cambio: Record<string, number>; // moeda -> VET (BRL por 1 unidade)
  dataCambio: string; // YYYY-MM-DD (referencia da cotacao)
  paises: string[]; // rotulos distintos presentes
};

// Le a tuition (unit_price da unica tabela ativa) por produto.
async function tuitionPorProduto(supabase: SupabaseClient, tenantId: string): Promise<Map<string, number>> {
  const { data } = await supabase
    .from("price_template_product")
    .select("product_id, price_template!inner(status, tenant_id, price_tier(min_quantity, unit_price))")
    .eq("price_template.tenant_id", tenantId)
    .eq("price_template.status", "active");
  const m = new Map<string, number>();
  for (const row of (data ?? []) as any[]) {
    const tiers = row.price_template?.price_tier ?? [];
    const t1 = tiers.find((t: any) => Number(t.min_quantity) === 1) ?? tiers[0];
    if (t1) m.set(row.product_id as string, num(t1.unit_price));
  }
  return m;
}

// Le as taxas (registration/material) por produto.
async function taxasPorProduto(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<Map<string, { registration: number; material: number; entrada: number }>> {
  const { data } = await supabase
    .from("fee_product")
    .select("product_id, fee!inner(tenant_id, fee_type, charge_basis, amount, is_refundable)")
    .eq("fee.tenant_id", tenantId);
  const m = new Map<string, { registration: number; material: number; entrada: number }>();
  for (const row of (data ?? []) as any[]) {
    const f = row.fee;
    if (!f) continue;
    const cur = m.get(row.product_id) ?? { registration: 0, material: 0, entrada: 0 };
    if (f.fee_type === "registration") cur.registration = num(f.amount);
    else if (f.fee_type === "material") cur.material = num(f.amount);
    // ENTRADA = taxas NAO reembolsaveis cobradas UMA VEZ (matricula, colocacao,
    // etc.). Material (per_unit) e recorrente, nao entra. is_refundable null =
    // tratado como nao reembolsavel.
    if (f.charge_basis === "once_per_item" && f.is_refundable !== true) {
      cur.entrada += num(f.amount);
    }
    m.set(row.product_id as string, cur);
  }
  return m;
}

// Le acomodacao (residence/homestay) e seguro por CAMPUS, a partir dos produtos
// kind accommodation/insurance + suas tabelas de preco (unit_price semanal).
async function extrasPorCampus(
  supabase: SupabaseClient,
  tenantId: string,
  tuition: Map<string, number>,
): Promise<{ accom: Map<string, AcomodacaoPrecos>; insurance: Map<string, number> }> {
  const { data } = await supabase
    .from("product")
    .select("id, campus_id, kind, attributes, accommodation_detail(accommodation_type)")
    .eq("tenant_id", tenantId)
    .in("kind", ["accommodation", "insurance"])
    .is("archived_at", null);
  const accom = new Map<string, AcomodacaoPrecos>();
  const insurance = new Map<string, number>();
  for (const p of (data ?? []) as any[]) {
    const preco = tuition.get(p.id as string) ?? 0;
    if (p.kind === "insurance") {
      if (preco > 0) insurance.set(p.campus_id as string, preco);
    } else {
      const tipo = p.accommodation_detail?.[0]?.accommodation_type ?? p.attributes?.accom_type;
      if (!tipo || !(preco > 0)) continue;
      const atual = (accom.get(p.campus_id as string) as { residence?: number; homestay?: number }) ?? {};
      if (tipo === "residence") atual.residence = preco;
      else if (tipo === "homestay") atual.homestay = preco;
      accom.set(p.campus_id as string, atual);
    }
  }
  return { accom, insurance };
}

export async function carregarCatalogoOrcamento(): Promise<CatalogoOrcamento> {
  const supabase = getSupabase();
  const tenantId = await tenantIdAtual(supabase);

  // Campus (id -> cidade/pais/moeda/fornecedor) e fornecedores (id -> nome).
  const { data: campusRows } = await supabase
    .from("campus")
    .select("id, city, country_code, base_currency, supplier_id, supplier!inner(display_name, website)")
    .eq("tenant_id", tenantId)
    .is("archived_at", null);
  const campusById = new Map<string, any>();
  for (const c of (campusRows ?? []) as any[]) campusById.set(c.id, c);

  // Precos: tuition (todos os produtos) + taxas + extras por campus.
  const tuition = await tuitionPorProduto(supabase, tenantId);
  const taxas = await taxasPorProduto(supabase, tenantId);
  const { accom, insurance } = await extrasPorCampus(supabase, tenantId, tuition);

  // Programas quotable.
  const { data: progRows } = await supabase
    .from("product")
    .select("id, name, internal_code, min_duration, max_duration, attributes, campus_id")
    .eq("tenant_id", tenantId)
    .eq("kind", "program")
    .eq("visibility", "quotable")
    .is("archived_at", null);

  const programas: ProgramaOrcavel[] = [];
  const paisesSet = new Set<string>();
  for (const p of (progRows ?? []) as any[]) {
    const campus = campusById.get(p.campus_id);
    if (!campus) continue;
    const min = Number(p.min_duration) || 0;
    const max = Number(p.max_duration) || min;
    const fixedFee = min === max && max > 0;
    const unit = tuition.get(p.id as string) ?? 0;
    const wfee = fixedFee ? round2(unit * max) : unit; // pacote fixo: reconstroi o total
    const fee = taxas.get(p.id as string) ?? { registration: 0, material: 0, entrada: 0 };
    const pais = PAIS_LABEL[campus.country_code as string] || (campus.country_code as string);
    paisesSet.add(pais);
    programas.push({
      id: p.id as string,
      slug: (p.internal_code as string) || (p.attributes?.slug as string) || (p.id as string),
      courseName: p.name as string,
      courseType: (p.attributes?.course_type as string) || "english-for-specific-purposes",
      city: campus.city as string,
      country: pais,
      school: campus.supplier?.display_name as string,
      flag: PAIS_FLAG[campus.country_code as string] || "",
      currency: campus.base_currency as string,
      minWeeks: min,
      maxWeeks: max,
      fixedFee,
      wfee,
      appFee: fee.registration,
      entradaMoeda: fee.entrada || fee.registration,
      wmatFee: fee.material,
      accom: (accom.get(p.campus_id as string) as AcomodacaoPrecos) ?? null,
      insuranceWeekly: insurance.get(p.campus_id as string) ?? 0,
      escolaUrl: normalizarUrl(campus.supplier?.website as string | null | undefined),
      programaUrl: normalizarUrl((p.attributes?.url as string | null | undefined)),
    });
  }

  // Cotacao do dia por moeda presente no catalogo (VET mais recente <= hoje).
  const hoje = hojeBrasilISO();
  const moedas = Array.from(new Set(programas.map((p) => p.currency).filter((m) => m && m !== "BRL")));
  const cambio: Record<string, number> = {};
  let dataCambio = hoje;
  for (const moeda of moedas) {
    const { data: cot } = await supabase
      .from("cotacoes_cambio")
      .select("cotacao_vet, data")
      .eq("moeda", moeda)
      .lte("data", hoje)
      .order("data", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (cot) {
      cambio[moeda] = Number(cot.cotacao_vet);
      if (cot.data && (cot.data as string) < dataCambio) dataCambio = cot.data as string;
    }
  }

  programas.sort((a, b) => a.school.localeCompare(b.school, "pt-BR") || a.courseName.localeCompare(b.courseName, "pt-BR"));
  return { programas, cambio, dataCambio, paises: Array.from(paisesSet).sort() };
}
