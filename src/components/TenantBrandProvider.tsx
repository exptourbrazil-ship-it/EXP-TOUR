"use client";

// Provedor da MARCA do tenant para a Area do Cliente (client components).
// O layout raiz resolve a marca pelo slug do deploy (CATALOGO_TENANT_SLUG) e a
// injeta aqui; os componentes de tela leem via `useTenantBrand()` sem precisar
// receber a marca por prop. Default seguro = EXP Tour (getTenantBrand(null)),
// entao o hook funciona mesmo fora do provedor.

import { createContext, useContext } from "react";
import { getTenantBrand, type TenantBrand } from "@/lib/tenant-brand";

const TenantBrandContext = createContext<TenantBrand>(getTenantBrand(null));

export function TenantBrandProvider({
  brand,
  children,
}: {
  brand: TenantBrand;
  children: React.ReactNode;
}) {
  return (
    <TenantBrandContext.Provider value={brand}>
      {children}
    </TenantBrandContext.Provider>
  );
}

/** Marca do tenant vigente na Area do Cliente. */
export function useTenantBrand(): TenantBrand {
  return useContext(TenantBrandContext);
}
