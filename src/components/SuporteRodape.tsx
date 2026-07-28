import { montarLinkSuporteWhatsApp, SITE_PUBLICO_EXP_TOUR, WHATSAPP_EXP_TOUR } from "@/lib/viagem"

// Rodape de suporte compartilhado. Antes o contato so aparecia na aba Viagem;
// agora o cliente tem um canal de ajuda visivel em todas as telas.
export default function SuporteRodape({ contexto }: { contexto?: string }) {
  return (
    <section className="mx-auto mt-8 max-w-md px-5">
      <div className="rounded-2xl border border-neutral-200 bg-white p-5 text-center shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-golddark">Precisa de ajuda?</p>
        <p className="mt-1 text-sm text-neutral-600">
          {contexto || "Fale com a equipe da EXP Tour — a gente responde rápido."}
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <a
            href={montarLinkSuporteWhatsApp()}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl bg-brand px-4 py-2 text-sm font-medium text-brand-cream transition hover:opacity-90"
          >
            WhatsApp {WHATSAPP_EXP_TOUR}
          </a>
          <a
            href={SITE_PUBLICO_EXP_TOUR}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl border border-neutral-300 px-4 py-2 text-sm font-medium text-brand transition hover:bg-brand-cream/60"
          >
            {SITE_PUBLICO_EXP_TOUR.replace("https://", "")}
          </a>
        </div>
      </div>
    </section>
  )
}
