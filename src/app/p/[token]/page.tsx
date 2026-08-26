import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { createClient } from "@supabase/supabase-js";
import BrandLogo from "@/components/BrandLogo";
import { getPublicQuote } from "@/lib/quote-issue-service";
import { getTenantBrand, type TenantBrand } from "@/lib/tenant-brand";
import { tokenValidoFormato } from "@/lib/quote-issue";
import PortalClient from "./PortalClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Portal PUBLICO do estudante (spec 9): sem auth, o token opaco e a posse.
// noindex/nofollow; nenhum dado do estudante alem do primeiro nome; nenhum
// identificador interno no HTML (as opcoes vao indexadas). Os valores foram
// congelados na emissao — o portal so LE, nunca recalcula.
// Titulo neutro de marca: o portal e multi-tenant (EXP Tour/Forio) e nao deve
// fixar o nome de uma instancia na aba do navegador.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Sua cotação",
};

// Moldura do portal, tematizada por TENANT: as variaveis CSS da marca sao
// aplicadas no wrapper (style), entao todo o conteudo herda a identidade da
// instancia (EXP Tour ou Forio). Sem marca definida -> EXP Tour (default).
function Moldura({
  children,
  brand,
  logoUrl,
  nome,
}: {
  children: React.ReactNode;
  brand?: TenantBrand;
  logoUrl?: string | null;
  nome?: string | null;
}) {
  const marca = brand ?? getTenantBrand(null);
  return (
    <div
      className="min-h-screen"
      style={{ ...(marca.styleVars as CSSProperties), background: "var(--p-page)", fontFamily: "var(--p-body)" }}
    >
      <header className="border-b bg-[color:var(--p-header-bg)] border-[color:var(--p-header-line)]">
        <div className="mx-auto max-w-3xl px-5 py-4 md:px-8">
          <BrandLogo brand={marca} logoUrl={logoUrl} nome={nome} />
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-8 md:px-8">{children}</main>
    </div>
  );
}

function Aviso({
  titulo,
  texto,
  brand,
}: {
  titulo: string;
  texto: string;
  brand?: TenantBrand;
}) {
  return (
    <Moldura brand={brand}>
      <div className="rounded-2xl border bg-[color:var(--p-surface)] border-[color:var(--p-line)] p-6 text-center">
        <h1 className="text-2xl text-[color:var(--p-ink)]" style={{ fontFamily: "var(--p-heading)" }}>
          {titulo}
        </h1>
        <p className="mt-2 text-sm text-[color:var(--p-muted)]">{texto}</p>
      </div>
    </Moldura>
  );
}

export default async function PortalEstudantePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  // Avisos de erro nao tem cotacao (logo, sem tenant): usam a marca da instancia
  // que opera o portal (CATALOGO_TENANT_SLUG, default 'forio').
  const marcaPadrao = getTenantBrand(process.env.CATALOGO_TENANT_SLUG ?? "forio");
  if (!tokenValidoFormato(token)) {
    return <Aviso brand={marcaPadrao} titulo="Cotação não encontrada" texto="Verifique o link recebido ou fale com o seu consultor." />;
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );

  let dados = null;
  try {
    dados = await getPublicQuote(supabase, token);
  } catch {
    return <Aviso brand={marcaPadrao} titulo="Não foi possível abrir a cotação" texto="Tente novamente em instantes ou fale com o seu consultor." />;
  }

  if (!dados) {
    return (
      <Aviso
        brand={marcaPadrao}
        titulo="Cotação indisponível"
        texto="Este link pode ter expirado ou sido desativado. Fale com o seu consultor para receber um novo."
      />
    );
  }

  const marca = getTenantBrand(dados.brandSlug);

  return (
    <Moldura brand={marca} logoUrl={dados.logoUrl} nome={dados.brand}>
      <PortalClient token={token} dados={dados} />
    </Moldura>
  );
}
