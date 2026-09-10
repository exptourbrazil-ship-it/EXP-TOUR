"use client"

import { montarLinkSuporteWhatsApp } from "@/lib/viagem"
import { useTenantBrand } from "@/components/TenantBrandProvider"

// Rodape de suporte compartilhado. Antes o contato so aparecia na aba Viagem;
// agora o cliente tem um canal de ajuda visivel em todas as telas.
export default function SuporteRodape({ contexto }: { contexto?: string }) {
  const brand = useTenantBrand()
  const brandName = brand.email.brandName
  return (
    <section className="mx-auto mt-8 max-w-md px-5">
      <div className="rounded-2xl border border-neutral-200 bg-white p-5 text-center shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-golddark">Precisa de ajuda?</p>
        <p className="mt-1 text-sm text-neutral-600">
          {contexto || `Fale com a equipe da ${brandName} — a gente responde rápido.`}
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <a
            href={montarLinkSuporteWhatsApp(brand.supportWhatsApp)}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl bg-brand px-4 py-2 text-sm font-medium text-brand-cream transition hover:opacity-90"
          >
            WhatsApp {brand.supportWhatsApp}
          </a>
          <a
            href={brand.publicSite}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl border border-neutral-300 px-4 py-2 text-sm font-medium text-brand transition hover:bg-brand-cream/60"
          >
            {brand.publicSite.replace("https://", "")}
          </a>
        </div>
      </div>
    </section>
  )
}
