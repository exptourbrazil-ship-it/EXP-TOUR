import Link from "next/link";
import type { CSSProperties } from "react";
import { exigirFornecedor } from "@/lib/fornecedor-guard";
import { getServiceClient } from "@/lib/fornecedor-dados";
import { brandDoFornecedor } from "@/lib/fornecedor-brand";
import { FORNECEDOR_NAV } from "@/lib/fornecedor-nav";
import LogoutButton from "../LogoutButton";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Logo do Forio (mark + wordmark), inline — o header claro do Forio o exibe;
// o EXP Tour (header verde) usa o wordmark em texto.
function LogoForio() {
  return (
    <svg viewBox="0 0 160 44" height="26" role="img" aria-label="Forio" xmlns="http://www.w3.org/2000/svg" style={{ display: "block" }}>
      <rect width="44" height="44" rx="11" fill="#1A1D38" />
      <path d="M11 34 L11 10" stroke="#fff" strokeWidth="4.2" strokeLinecap="round" />
      <path d="M11 10 L33 10" stroke="#fff" strokeWidth="4.2" strokeLinecap="round" />
      <path d="M11 21 L27 21" stroke="#7080F4" strokeWidth="4.2" strokeLinecap="round" />
      <text x="54" y="30" fontFamily="Inter, sans-serif" fontSize="22" fontWeight="500" letterSpacing="-0.8">
        <tspan fill="#0F1020">For</tspan><tspan fill="#3B4DC9">io</tspan>
      </text>
    </svg>
  );
}

// Ícone do item de nav (SVG path). Stroke herda a cor do link (--p-nav).
function IconeNav({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" width={16} height={16} aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d={d} />
    </svg>
  );
}

// Layout das telas AUTENTICADAS do Portal do Parceiro. Aplica a MARCA do tenant
// do supplier (EXP Tour / Forio) via variaveis CSS (--p-*), do mesmo jeito que a
// Area do Cliente — as mesmas telas vestem a identidade certa sem duplicar codigo.
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const sessao = await exigirFornecedor("/fornecedor");

  const supabase = getServiceClient();
  const [{ data: supplier }, brand] = await Promise.all([
    supabase.from("supplier").select("display_name").eq("id", sessao.supplierId).maybeSingle(),
    brandDoFornecedor(supabase, sessao.supplierId),
  ]);

  return (
    <div style={{ ...(brand.styleVars as CSSProperties), minHeight: "100vh", background: "var(--p-page)", fontFamily: "var(--p-body)" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 24px",
          background: "var(--p-header-bg)",
          color: "var(--p-header-fg)",
          borderBottom: "1px solid var(--p-header-line)",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
          {brand.logo === "forio" ? (
            <LogoForio />
          ) : (
            <span style={{ fontFamily: "var(--p-heading)", fontSize: 20 }}>EXP Tour · Portal do Parceiro</span>
          )}
          <nav style={{ display: "flex", gap: 16, fontSize: 14, flexWrap: "wrap" }}>
            {FORNECEDOR_NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--p-nav)", textDecoration: "none" }}
              >
                <IconeNav d={n.icone} />
                {n.label}
              </Link>
            ))}
          </nav>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 13, opacity: 0.85 }}>{supplier?.display_name || sessao.email}</span>
          <LogoutButton />
        </div>
      </header>

      <main style={{ maxWidth: 880, margin: "0 auto", padding: "28px 24px" }}>{children}</main>
    </div>
  );
}
