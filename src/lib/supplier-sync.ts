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

    const { error: userErr } = await supabase.from("supplier_user").upsert(
      {
        tenant_id: tenantId,
        supplier_id: sup.id,
        email: m.email,
        name: m.contactName || m.email,
        role: "supplier_admin",
        language: "en",
      },
      { onConflict: "email" }
    );
    if (userErr) {
      erros.push(`supplier_user ${m.email}: ${userErr.message}`);
    } else {
      usersUpsert++;
    }
  }

  return {
    dryRun: false,
    totalVendors: vendors.length,
    suppliersUpsert,
    usersUpsert,
    semEmail,
    erros,
  };
}
