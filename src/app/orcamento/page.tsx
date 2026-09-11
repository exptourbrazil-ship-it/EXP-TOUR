import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { getTenantBrand } from "@/lib/tenant-brand";
import { carregarCatalogoOrcamento } from "@/lib/orcamento-catalogo";
import OrcamentoClient from "./OrcamentoClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Página PÚBLICA (lead-facing) de orçamento — o Forio Marketplace. Sem login,
// noindex. Monta o orçamento ao vivo com o câmbio do dia. Tematizada pelo tenant.
export const metadata: Metadata = {
  title: "Monte seu orçamento — Forio",
  robots: { index: false, follow: false },
};

export default async function OrcamentoPage() {
  const brand = getTenantBrand(process.env.CATALOGO_TENANT_SLUG ?? "forio");
  let catalogo;
  try {
    catalogo = await carregarCatalogoOrcamento();
  } catch {
    return (
      <main style={{ ...(brand.styleVars as CSSProperties), background: "var(--p-page)", minHeight: "100vh" }}>
        <div style={{ maxWidth: 640, margin: "0 auto", padding: "64px 24px", fontFamily: "var(--p-body)" }}>
          <h1 style={{ color: "var(--p-ink)", fontSize: 22 }}>Orçamento indisponível</h1>
          <p style={{ color: "var(--p-muted)", marginTop: 12 }}>
            Não foi possível carregar os programas agora. Tente novamente em instantes.
          </p>
        </div>
      </main>
    );
  }

  return (
    <div style={{ ...(brand.styleVars as CSSProperties), background: "var(--p-page)", minHeight: "100vh", fontFamily: "var(--p-body)" }}>
      <OrcamentoClient
        programas={catalogo.programas}
        cambio={catalogo.cambio}
        dataCambio={catalogo.dataCambio}
        paises={catalogo.paises}
      />
    </div>
  );
}
