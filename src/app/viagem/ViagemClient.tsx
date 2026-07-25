"use client"

import BottomNav from "@/components/BottomNav"
import { montarLinkMapa, montarLinkSuporteWhatsApp, SITE_PUBLICO_EXP_TOUR, WHATSAPP_EXP_TOUR, type InfoEmergencia } from "@/lib/viagem"

type ViagemInfo = {
  escola_nome: string | null
  escola_endereco: string | null
  acomodacao_endereco: string | null
  contato_local_nome: string | null
  contato_local_telefone: string | null
  observacoes: string | null
}

type ViagemClientProps = {
  nomeExibicao: string | null
  emergencia: InfoEmergencia | null
  info: ViagemInfo | null
  afiliadoMoedaUrl: string | null
  afiliadoChipUrl: string | null
}

const LOGO_URL = "https://exp-tour.com/wp-content/uploads/2026/04/EXP-Tour-Original-Logo.svg"

function primeiroNome(nome: string | null): string {
  if (!nome) return ""
  return nome.trim().split(" ")[0]
}

export default function ViagemClient(props: ViagemClientProps) {
  const nome = primeiroNome(props.nomeExibicao)
  const info = props.info
  const temEndereco = !!(info && (info.escola_nome || info.escola_endereco || info.acomodacao_endereco || info.contato_local_nome || info.observacoes))
  const mapaEscola = info ? montarLinkMapa(info.escola_endereco) : null
  const mapaAcomodacao = info ? montarLinkMapa(info.acomodacao_endereco) : null

  return (
    <div className="min-h-screen bg-brand-cream/40 pb-28">
      <header className="flex items-center justify-between px-5 py-4">
        <img src={LOGO_URL} alt="EXP TOUR" className="h-6" />
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand text-sm font-medium text-brand-cream">
          {nome ? nome.charAt(0).toUpperCase() : "?"}
        </div>
      </header>

      <main className="mx-auto max-w-md px-5 py-2">
        <h1 className="font-serif text-4xl text-brand">Durante a viagem</h1>
        <p className="mt-2 text-sm text-neutral-500">
          Tudo o que voce precisa ter a mao enquanto estiver no destino.
        </p>

        {/* Fale com a EXP Tour */}
        <section className="mt-6 rounded-3xl bg-brand p-6 text-brand-cream shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-gold">
            Fale com a EXP Tour
          </p>
          <p className="mt-3 text-sm text-brand-cream/80">
            Precisa de ajuda? A gente esta com voce em qualquer fuso.
          </p>
          <a
            href={montarLinkSuporteWhatsApp()}
            target="_blank"
            rel="noreferrer"
            className="mt-4 block rounded-xl bg-brand-gold py-3 text-center text-sm font-semibold text-brand transition hover:opacity-90"
          >
            WhatsApp {WHATSAPP_EXP_TOUR}
          </a>
          <a
            href={SITE_PUBLICO_EXP_TOUR}
            target="_blank"
            rel="noreferrer"
            className="mt-3 block text-center text-sm text-brand-cream/90 underline"
          >
            {SITE_PUBLICO_EXP_TOUR.replace("https://", "")}
          </a>
        </section>

        {/* Em caso de emergencia */}
        {props.emergencia ? (
          <section className="mt-5 rounded-3xl border border-red-200 bg-red-50 p-6 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-red-500">
              Em caso de emergencia
            </p>
            <h2 className="mt-2 font-serif text-2xl text-red-700">
              {props.emergencia.pais}: {props.emergencia.numeroEmergencia}
            </h2>
            <p className="mt-1 text-sm text-red-600/80">
              Policia, ambulancia e bombeiros. Ligue em qualquer emergencia grave.
            </p>
            <a
              href={"tel:" + props.emergencia.numeroEmergencia}
              className="mt-4 block rounded-xl bg-red-600 py-3 text-center text-sm font-semibold text-white transition hover:opacity-90"
            >
              Ligar {props.emergencia.numeroEmergencia}
            </a>
          </section>
        ) : null}

        {/* Escola e acomodacao */}
        <section className="mt-5 rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-gold">
            Escola e acomodacao
          </p>
          {temEndereco ? (
            <div className="mt-3 space-y-5">
              {info && (info.escola_nome || info.escola_endereco) ? (
                <div>
                  <p className="text-sm font-medium text-brand">{info.escola_nome || "Escola"}</p>
                  {info.escola_endereco ? <p className="mt-1 text-sm text-neutral-500">{info.escola_endereco}</p> : null}
                  {mapaEscola ? (
                    <a href={mapaEscola} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm font-medium text-brand-gold underline">
                      Ver no mapa
                    </a>
                  ) : null}
                </div>
              ) : null}

              {info && info.acomodacao_endereco ? (
                <div>
                  <p className="text-sm font-medium text-brand">Acomodacao</p>
                  <p className="mt-1 text-sm text-neutral-500">{info.acomodacao_endereco}</p>
                  {mapaAcomodacao ? (
                    <a href={mapaAcomodacao} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm font-medium text-brand-gold underline">
                      Ver no mapa
                    </a>
                  ) : null}
                </div>
              ) : null}

              {info && (info.contato_local_nome || info.contato_local_telefone) ? (
                <div>
                  <p className="text-sm font-medium text-brand">Contato local</p>
                  {info.contato_local_nome ? <p className="mt-1 text-sm text-neutral-500">{info.contato_local_nome}</p> : null}
                  {info.contato_local_telefone ? (
                    <a href={"tel:" + info.contato_local_telefone} className="mt-1 inline-block text-sm text-brand-gold underline">
                      {info.contato_local_telefone}
                    </a>
                  ) : null}
                </div>
              ) : null}

              {info && info.observacoes ? (
                <p className="whitespace-pre-line border-t border-neutral-100 pt-4 text-sm text-neutral-500">{info.observacoes}</p>
              ) : null}
            </div>
          ) : (
            <p className="mt-3 text-sm text-neutral-500">
              Os dados da sua escola e acomodacao aparecerao aqui em breve.
            </p>
          )}
        </section>

        {/* Servicos para a viagem (parceiros / afiliados) */}
        {(props.afiliadoMoedaUrl || props.afiliadoChipUrl) ? (
          <section className="mt-5 rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-gold">
              Prepare-se para a viagem
            </p>
            <p className="mt-2 text-sm text-neutral-500">
              Parceiros da EXP Tour para voce chegar tranquilo.
            </p>
            <div className="mt-4 space-y-3">
              {props.afiliadoMoedaUrl ? (
                <a
                  href={props.afiliadoMoedaUrl}
                  target="_blank"
                  rel="noreferrer nofollow sponsored"
                  className="flex items-center justify-between rounded-xl bg-brand px-4 py-3 text-sm font-medium text-brand-cream transition hover:opacity-90"
                >
                  <span>Comprar moeda do destino</span>
                  <span className="ml-3 shrink-0">&rarr;</span>
                </a>
              ) : null}
              {props.afiliadoChipUrl ? (
                <a
                  href={props.afiliadoChipUrl}
                  target="_blank"
                  rel="noreferrer nofollow sponsored"
                  className="flex items-center justify-between rounded-xl bg-brand px-4 py-3 text-sm font-medium text-brand-cream transition hover:opacity-90"
                >
                  <span>Comprar chip de celular</span>
                  <span className="ml-3 shrink-0">&rarr;</span>
                </a>
              ) : null}
            </div>
          </section>
        ) : null}
      </main>

      <BottomNav />
    </div>
  )
}
