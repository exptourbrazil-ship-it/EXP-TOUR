import Logo from "@/components/Logo";
import type { TenantBrand } from "@/lib/tenant-brand";

// Logo por TENANT no portal do estudante. Ordem de preferencia:
//  1) logo_url do tenant (asset oficial enviado pela instancia) — <img>;
//  2) logo vetorial embutido por tema (EXP Tour);
//  3) wordmark tipografico (Forio) — a cor vem de currentColor (--p-header-fg).
//
// Obs.: para a Forio usamos o wordmark tipografico ate que o asset oficial seja
// cadastrado em tenant.logo_url; assim nao embutimos um vetor "adivinhado" da
// marca. Basta preencher logo_url para trocar pelo logotipo oficial.
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
    return (
      <span
        aria-label={nome ?? "Forio"}
        className="inline-flex items-baseline gap-0.5 text-[color:var(--p-header-fg)]"
        style={{ fontFamily: "var(--p-heading)" }}
      >
        <span className="text-[26px] font-medium leading-none tracking-tight">forio</span>
        {/* ponto em Portal Blue: unico realce de cor no logotipo */}
        <span className="text-[26px] font-medium leading-none text-[color:var(--p-cta)]">.</span>
      </span>
    );
  }

  // EXP Tour: logo vetorial oficial. Fundo escuro (cabecalho verde) -> variante clara.
  return <Logo escuro />;
}
