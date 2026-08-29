import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { createClient } from "@supabase/supabase-js";
import BrandLogo from "@/components/BrandLogo";
import { getPublicQuote, getQuoteConvertida } from "@/lib/quote-issue-service";
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
    // Reabertura DEPOIS do aceite: mostra o estado terminal "ja aceita" (com a
    // marca da instancia da cotacao), em vez de "indisponivel".
    const conv = await getQuoteConvertida(supabase, token).catch(() => null);
    if (conv) {
      return (
        <Moldura brand={getTenantBrand(conv.brandSlug)} logoUrl={conv.logoUrl} nome={conv.brand}>
          <div className="rounded-2xl border bg-[color:var(--p-surface)] border-[color:var(--p-line)] p-6 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[color:var(--p-success-soft)]">
              <svg viewBox="0 0 24 24" fill="none" stroke="var(--p-success)" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7" aria-hidden="true">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </div>
            <h1 className="mt-4 text-2xl text-[color:var(--p-ink)]" style={{ fontFamily: "var(--p-heading)" }}>
              Matrícula já confirmada
            </h1>
            <p className="mx-auto mt-2 max-w-md text-sm text-[color:var(--p-muted)]">
              {conv.studentFirstName ? `${conv.studentFirstName}, esta ` : "Esta "}proposta já foi aceita. Enviamos
              um <strong className="text-[color:var(--p-ink)]">código de acesso</strong> para o seu e-mail — entre na
              Área do Cliente com o seu CPF e o código para acompanhar o seu programa.
            </p>
            <a
              href="/"
              className="mt-6 inline-flex min-h-[44px] items-center rounded-xl bg-[color:var(--p-cta)] px-6 py-3 text-sm font-medium text-[color:var(--p-cta-fg)] hover:opacity-90"
            >
              Ir para a Área do Cliente
            </a>
            <p className="mt-6 text-[11px] text-[color:var(--p-muted)] opacity-70">
              Cotação {conv.reference} · {conv.brand}
            </p>
          </div>
        </Moldura>
      );
    }
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
