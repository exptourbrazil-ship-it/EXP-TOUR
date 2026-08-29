import { cookies } from "next/headers";
import type { CSSProperties } from "react";
import Link from "next/link";
import Logo from "@/components/Logo";
import AdminNav from "@/components/AdminNav";
import { verificarSessaoAdmin, ADMIN_SESSION_COOKIE } from "@/lib/admin-session";
import { PAPEL_LABEL } from "@/lib/admin-roles";
import { getTenantBrand } from "@/lib/tenant-brand";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Logo do Forio para header escuro (bg-brand = Night): wordmark claro, "io" em
// Sky Indigo (exclusivo do logo). O EXP Tour usa o <Logo escuro /> de sempre.
function LogoForioDark() {
  return (
    <svg viewBox="0 0 160 44" height="34" role="img" aria-label="Forio" xmlns="http://www.w3.org/2000/svg" style={{ display: "block" }}>
      <rect width="44" height="44" rx="11" fill="#1A1D38" />
      <path d="M11 34 L11 10" stroke="#fff" strokeWidth="4.2" strokeLinecap="round" />
      <path d="M11 10 L33 10" stroke="#fff" strokeWidth="4.2" strokeLinecap="round" />
      <path d="M11 21 L27 21" stroke="#7080F4" strokeWidth="4.2" strokeLinecap="round" />
      <text x="54" y="30" fontFamily="Inter, sans-serif" fontSize="22" fontWeight="500" letterSpacing="-0.8">
        <tspan fill="#fff">For</tspan><tspan fill="#7080F4">io</tspan>
      </text>
    </svg>
  );
}

// Layout comum do painel admin: barra superior no verde da marca + menu de
// navegacao (lateral no desktop, faixa no topo no mobile). So desenha o
// "shell" quando ha sessao de admin valida; caso contrario (ex.: tela de
// login), renderiza o conteudo puro. As paginas protegidas continuam
// chamando exigirAdmin por conta propria — aqui a verificacao apenas decide
// se mostra a moldura de navegacao.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
  const sessao = verificarSessaoAdmin(token);

  // Marca da INSTANCIA (o admin opera um tenant): re-tematiza as classes brand-*
  // e os tokens --p-* aplicando os styleVars do tenant no wrapper.
  const brand = getTenantBrand(process.env.CATALOGO_TENANT_SLUG ?? null);

  // Sem sessao valida (ex.: /admin/login) — sem moldura de navegacao, mas ainda
  // com a marca do tenant (para o login vestir a identidade certa).
  if (!sessao) {
    return <div style={brand.styleVars as CSSProperties}>{children}</div>;
  }

  return (
    <div className="min-h-screen bg-brand-cream/30" style={brand.styleVars as CSSProperties}>
      <header className="bg-brand">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 md:px-8">
          <Link href="/admin" aria-label="Início do painel">
            {brand.logo === "forio" ? <LogoForioDark /> : <Logo escuro />}
          </Link>
          <div className="flex items-center gap-3">
            {/* Papel do operador no chrome: deixa claro "com que chapeu" ele opera. */}
            <span className="hidden rounded-full bg-brand-cream/15 px-2.5 py-1 text-xs font-medium text-brand-cream ring-1 ring-brand-cream/20 sm:inline">
              {PAPEL_LABEL[sessao.papel]}
            </span>
            <span
              className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-cream text-sm font-medium text-brand ring-1 ring-white/20"
              title={`${sessao.usuario} · ${PAPEL_LABEL[sessao.papel]}`}
              aria-label={`Sessão de ${sessao.usuario} (${PAPEL_LABEL[sessao.papel]})`}
            >
              {sessao.usuario.trim().charAt(0).toUpperCase() || "A"}
            </span>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl flex-col lg:min-h-[calc(100vh-73px)] lg:flex-row">
        <aside className="border-b border-neutral-200 bg-white lg:border-b-0">
          <AdminNav papel={sessao.papel} />
        </aside>
        <main className="flex-1 px-5 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
