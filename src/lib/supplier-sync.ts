// Sincronizacao Vendors (Zoho CRM) -> supplier (+ supplier_user), reusando o
// mesmo OAuth do zoho.ts. Unidirecional (Zoho e a origem comercial; o Supabase
// e a fonte de verdade operacional): rodar de novo faz upsert, nunca duplica.
//
// Os VALIDADORES/MAPEADORES no topo sao PUROS (sem rede/DB), testados em
// supplier-sync.test.ts. A funcao de sincronizacao no fim usa a service role.
import type { SupabaseClient } from "@supabase/supabase-js";
// O import do zoho.ts fica DINAMICO (dentro da sincronizacao) porque o alias @/
// nao e resolvido pelo runner `node --test`; assim o grafo de modulos de topo
// carrega e os MAPEADORES puros no topo podem ser testados sem mocks de rede.

export type VendorZoho = Record<string, unknown>;

function texto(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

// Normaliza um nome de instituicao para casar escola_nome (viagem_info) com
// display_name (supplier) — ambos vindos do Vendor_Name do Zoho. So minusculas,
// sem acento e com espacos colapsados; retorna "" quando nao ha nome util.
export function normalizarNome(v: unknown): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove diacriticos (acentos)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// Extrai e valida o e-mail do Vendor (para virar o login do supplier_user).
export function extrairEmailVendor(vendor: VendorZoho): string | null {
  const e = texto(vendor.Email);
  if (!e) return null;
  const lower = e.toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lower) ? lower : null;
}

export type SupplierMapeado = {
  supplier: {
    tenant_id: string;
    zoho_vendor_id: string;
    display_name: string;
    website: string | null;
    country_code: string | null;
    relationship_status: string;
  };
  email: string | null;
  contactName: string;
};

// Mapeia um Vendor do Zoho para uma linha de supplier. Retorna null quando o
// Vendor nao tem id (sem id nao ha como deduplicar com seguranca).
export function mapVendorToSupplier(vendor: VendorZoho, tenantId: string): SupplierMapeado | null {
  const zohoVendorId = texto(vendor.id);
  if (!zohoVendorId) return null;

  const nome = texto(vendor.Vendor_Name) || texto((vendor as { Name?: unknown }).Name);
  // O Zoho costuma guardar o pais por extenso ("United States"); so aceitamos
  // como country_code se ja vier num codigo de 2 letras (a coluna e char(2)).
  const countryRaw = texto(vendor.Country);
  const countryCode = countryRaw && /^[A-Za-z]{2}$/.test(countryRaw) ? countryRaw.toUpperCase() : null;

  return {
    supplier: {
      tenant_id: tenantId,
      zoho_vendor_id: zohoVendorId,
      display_name: nome || "(sem nome)",
      website: texto(vendor.Website),
      country_code: countryCode,
      // Importados do CRM sao parceiros ja existentes, nao prospects.
      relationship_status: "connected",
    },
    email: extrairEmailVendor(vendor),
    contactName: nome || "",
  };
}

export type ResultadoSync =
  | {
      dryRun: true;
      totalVendors: number;
      mapeados: number;
      comEmail: number;
      amostra: SupplierMapeado[];
    }
  | {
      dryRun: false;
      totalVendors: number;
      suppliersUpsert: number;
      usersUpsert: number;
      semEmail: number;
      contratosVinculados: number;
      erros: string[];
    };

// Busca todos os Vendors do Zoho (paginado, com teto de seguranca) e sincroniza.
// Com dryRun=true (padrao), NAO grava: devolve o que SERIA importado, para
// conferir os campos reais do CRM antes de aplicar.
export async function sincronizarVendorsDoZoho(
  supabase: SupabaseClient,
  opts: { tenantId: string; dryRun?: boolean; maxPaginas?: number }
): Promise<ResultadoSync> {
  const { tenantId } = opts;
  const dryRun = opts.dryRun !== false; // padrao: dry-run
  const maxPaginas = opts.maxPaginas ?? 25; // 25 * 200 = 5000 Vendors de teto

  const { getZohoRecords } = await import("@/lib/zoho");

  const vendors: VendorZoho[] = [];
  for (let page = 1; page <= maxPaginas; page++) {
    const { records, moreRecords } = await getZohoRecords("Vendors", { page, perPage: 200 });
    vendors.push(...records);
    if (!moreRecords) break;
  }

  const mapeados = vendors
    .map((v) => mapVendorToSupplier(v, tenantId))
    .filter((m): m is SupplierMapeado => m !== null);

  if (dryRun) {
    return {
      dryRun: true,
      totalVendors: vendors.length,
      mapeados: mapeados.length,
      comEmail: mapeados.filter((m) => m.email).length,
      amostra: mapeados.slice(0, 10),
    };
  }

  let suppliersUpsert = 0;
  let usersUpsert = 0;
  let semEmail = 0;
  const erros: string[] = [];

  for (const m of mapeados) {
    const { data: sup, error: supErr } = await supabase
      .from("supplier")
      .upsert(m.supplier, { onConflict: "zoho_vendor_id" })
      .select("id")
      .single();

    if (supErr || !sup) {
      erros.push(`supplier ${m.supplier.display_name}: ${supErr?.message ?? "sem retorno"}`);
      continue;
    }
    suppliersUpsert++;

    if (!m.email) {
      semEmail++;
      continue;
    }

    const vendorId = m.supplier.zoho_vendor_id;

    // Adota uma linha existente com o mesmo e-mail que ainda nao tem
    // zoho_vendor_id (migracao de dados criados antes da dedup): marca o Vendor
    // para que o upsert abaixo ATUALIZE essa linha em vez de criar outra. Nao
    // toca em usuarios convidados a mao (que continuam com zoho_vendor_id NULL).
    await supabase
      .from("supplier_user")
      .update({ zoho_vendor_id: vendorId, supplier_id: sup.id })
      .eq("email", m.email)
      .is("zoho_vendor_id", null);

    // Upsert pelo Vendor: uma linha por Vendor, para sempre. Uma nova sync
    // atualiza e-mail/nome na MESMA linha, nunca duplica.
    const { error: userErr } = await supabase.from("supplier_user").upsert(
      {
        tenant_id: tenantId,
        supplier_id: sup.id,
        zoho_vendor_id: vendorId,
        email: m.email,
        name: m.contactName || m.email,
        role: "supplier_admin",
        language: "en",
      },
      { onConflict: "zoho_vendor_id" }
    );
    if (userErr) {
      erros.push(`supplier_user ${m.email}: ${userErr.message}`);
    } else {
      usersUpsert++;
    }
  }

  // Vincula contratos ao fornecedor por NOME (viagem_info.escola_nome =
  // supplier.display_name, ambos vindos do Vendor_Name do Zoho). So preenche o
  // que falta (contratos sem supplier_id) -> idempotente.
  let contratosVinculados = 0;
  try {
    const { data: sups } = await supabase
      .from("supplier")
      .select("id, display_name")
      .eq("tenant_id", tenantId);
    const porNome = new Map<string, string>();
    for (const s of sups ?? []) {
      const chave = normalizarNome((s as { display_name?: string }).display_name);
      if (chave) porNome.set(chave, (s as { id: string }).id);
    }

    const { data: viagens } = await supabase
      .from("viagem_info")
      .select("contrato_id, escola_nome")
      .not("escola_nome", "is", null);

    for (const v of viagens ?? []) {
      const sid = porNome.get(normalizarNome((v as { escola_nome?: string }).escola_nome));
      if (!sid) continue;
      const { data: upd } = await supabase
        .from("contratos")
        .update({ supplier_id: sid })
        .eq("id", (v as { contrato_id: string }).contrato_id)
        .is("supplier_id", null)
        .select("id");
      contratosVinculados += upd?.length ?? 0;
    }
  } catch (err) {
    erros.push(`vinculo contratos: ${err instanceof Error ? err.message : "erro"}`);
  }

  return {
    dryRun: false,
    totalVendors: vendors.length,
    suppliersUpsert,
    usersUpsert,
    semEmail,
    contratosVinculados,
    erros,
  };
}
