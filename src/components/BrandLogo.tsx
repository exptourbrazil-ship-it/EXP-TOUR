import Logo from "@/components/Logo";
import type { TenantBrand } from "@/lib/tenant-brand";

// Sky Indigo: azul de destaque EXCLUSIVO do logotipo Forio (Manual da Marca).
// Nao entra na UI (la o interativo e o Portal Blue --p-cta); aqui e legitimo
// porque isto E o logotipo.
const FORIO_SKY = "#7080f4";

// Logo por TENANT no portal do estudante. Ordem de preferencia:
//  1) logo_url do tenant (asset oficial enviado pela instancia) — <img>;
//  2) logo vetorial embutido por tema (Forio: marca "F" + wordmark "Forio";
//     EXP Tour: logo oficial).
export default function BrandLogo({
  brand,
  logoUrl,
  nome,
}: {
  brand: TenantBrand;
  logoUrl?: string | null;
  nome?: string | null;
}) {
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt={nome ?? brand.slug}
        className="h-9 w-auto"
      />
    );
  }

  if (brand.logo === "forio") {
    // Logotipo oficial da Forio, reproduzido em SVG (nitido, transparente,
    // adapta a cor do wordmark ao cabecalho). Marca: ladrilho Night com "F"
    // branco e barra central em Sky Indigo. Wordmark: "For" na cor do
    // cabecalho (--p-header-fg) + "io" em Sky Indigo.
    return (
      <span aria-label={nome ?? "Forio"} className="inline-flex items-center gap-2.5">
        <svg viewBox="0 0 100 100" className="h-9 w-9 shrink-0" aria-hidden="true">
          <rect x="4" y="4" width="92" height="92" rx="23" fill="#171830" />
          {/* haste vertical do F */}
          <rect x="28" y="26" width="12" height="50" rx="6" fill="#ffffff" />
          {/* braco superior */}
          <rect x="28" y="26" width="42" height="12" rx="6" fill="#ffffff" />
          {/* barra central em Sky Indigo (extrapola um pouco a haste, como no oficial) */}
          <rect x="22" y="46" width="38" height="12" rx="6" fill={FORIO_SKY} />
        </svg>
        <span
          className="text-[26px] font-medium leading-none tracking-tight text-[color:var(--p-header-fg)]"
          style={{ fontFamily: "var(--p-heading)" }}
        >
          For<span style={{ color: FORIO_SKY }}>io</span>
        </span>
      </span>
    );
  }

  // EXP Tour: logo vetorial oficial. Fundo escuro (cabecalho verde) -> variante clara.
  return <Logo escuro />;
}
