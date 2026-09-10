import type { Metadata } from "next";
import "./globals.css";
import { getTenantBrand } from "@/lib/tenant-brand";
import { TenantBrandProvider } from "@/components/TenantBrandProvider";

// Marca do deploy: o slug do tenant (CATALOGO_TENANT_SLUG) escolhe a identidade
// da Area do Cliente. Default 'forio' — para exp-tour o resultado e identico ao
// atual, pois os styleVars da EXP Tour igualam os defaults de :root.
const brand = getTenantBrand(process.env.CATALOGO_TENANT_SLUG ?? "forio");

export const metadata: Metadata = {
    title: `Area do Cliente | ${brand.email.brandName}`,
    description: `Portal do cliente ${brand.email.brandName} - contratos, documentos e parcelas`,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="pt-BR">
            <head>
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
                {/* Bellefair (titulo EXP Tour) + Inter (identidade Forio, 400/500). */}
                <link
                    href="https://fonts.googleapis.com/css2?family=Bellefair&family=Inter:wght@400;500&display=swap"
                    rel="stylesheet"
                />
            </head>
            <body
                className="min-h-screen bg-brand font-sans text-neutral-900 antialiased"
                style={brand.styleVars}
            >
                <TenantBrandProvider brand={brand}>{children}</TenantBrandProvider>
            </body>
        </html>
    );
}
