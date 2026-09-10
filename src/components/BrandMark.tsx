"use client";

// Logotipo da Area do Cliente com a marca do TENANT vigente. Le a marca do
// provedor (useTenantBrand) e delega ao BrandLogo — que ja sabe renderizar o
// logo da Forio (ladrilho "F" + wordmark) ou da EXP Tour (Logo escuro). Para o
// slug exp-tour, BrandLogo retorna exatamente <Logo escuro />, identico a hoje.

import BrandLogo from "@/components/BrandLogo";
import { useTenantBrand } from "@/components/TenantBrandProvider";

// `escuro`: quando o logo fica sobre um FUNDO ESCURO (ex.: tela de login), o
// wordmark da Forio precisa sair em branco (no cabecalho branco ele e escuro).
export default function BrandMark({ escuro = false }: { escuro?: boolean }) {
  const brand = useTenantBrand();
  return <BrandLogo brand={brand} escuro={escuro} />;
}
