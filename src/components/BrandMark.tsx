"use client";

// Logotipo da Area do Cliente com a marca do TENANT vigente. Le a marca do
// provedor (useTenantBrand) e delega ao BrandLogo — que ja sabe renderizar o
// logo da Forio (ladrilho "F" + wordmark) ou da EXP Tour (Logo escuro). Para o
// slug exp-tour, BrandLogo retorna exatamente <Logo escuro />, identico a hoje.

import BrandLogo from "@/components/BrandLogo";
import { useTenantBrand } from "@/components/TenantBrandProvider";

export default function BrandMark() {
  const brand = useTenantBrand();
  return <BrandLogo brand={brand} />;
}
