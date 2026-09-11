import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { getTenantBrand } from "@/lib/tenant-brand";
import { carregarCatalogoOrcamento } from "@/lib/orcamento-catalogo";
import { decodeParams } from "../shared";
import CompararClient from "./CompararClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Tela 2 do orcamento: comparacao lado a lado dos programas escolhidos + simulador
// de parcelas comum. A selecao e os parametros viajam na URL, entao ESTE link JA E
// o orcamento compartilhavel — ao abrir, recarrega o cambio do dia (nao congela).
export const metadata: Metadata = {
  title: "Seu orçamento — Forio",
  robots: { index: false, follow: false },
};

export default async function CompararPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const brand = getTenantBrand(process.env.CATALOGO_TENANT_SLUG ?? "forio");
  const sp = new URLSearchParams(await searchParams);
  const params = decodeParams(sp);

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
          <h1 style={{ color: "var(--p-ink)", fontSize: 22 }}>Orçamento vazio</h1>
          <p style={{ color: "var(--p-muted)", marginTop: 12 }}>
            Nenhum programa selecionado. <a href="/orcamento" style={{ color: "var(--p-cta)" }}>Voltar à busca</a>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={wrap}>
      <CompararClient
        programas={selecionados}
        cambio={catalogo.cambio}
        dataCambio={catalogo.dataCambio}
        params={params}
      />
    </div>
  );
}
