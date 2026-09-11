import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { getTenantBrand } from "@/lib/tenant-brand";
import { carregarCatalogoOrcamento } from "@/lib/orcamento-catalogo";
import { decodeParams } from "../shared";
import CheckoutClient from "./CheckoutClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Encaminhar matrícula — Forio",
  robots: { index: false, follow: false },
};

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const brand = getTenantBrand(process.env.CATALOGO_TENANT_SLUG ?? "forio");
  const sp = new URLSearchParams(await searchParams);
  const params = decodeParams(sp);
  const parcelasRaw = sp.get("parcelas");
  const numParcelas = parcelasRaw && parcelasRaw !== "auto" ? parseInt(parcelasRaw) : null;

  let catalogo;
  try {
    catalogo = await carregarCatalogoOrcamento();
  } catch {
    catalogo = null;
  }
  const wrap: CSSProperties = { ...(brand.styleVars as CSSProperties), background: "var(--p-page)", minHeight: "100vh", fontFamily: "var(--p-body)" };
  const selecionados = (catalogo?.programas ?? []).filter((p) => params.ids.includes(p.id));

  if (!catalogo || selecionados.length === 0) {
    return (
      <div style={wrap}>
        <div style={{ maxWidth: 640, margin: "0 auto", padding: "64px 24px" }}>
          <h1 style={{ color: "var(--p-ink)", fontSize: 22 }}>Nada para matricular</h1>
          <p style={{ color: "var(--p-muted)", marginTop: 12 }}>
            <a href="/orcamento" style={{ color: "var(--p-cta)" }}>Voltar à busca</a>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={wrap}>
      <CheckoutClient programas={selecionados} cambio={catalogo.cambio} params={params} numParcelas={numParcelas} />
    </div>
  );
}
