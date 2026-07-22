"use client"

import Link from "next/link"
import BottomNav from "@/components/BottomNav"

type Contrato = {
  id: string
  nome: string | null
  valor_total: number | null
  moeda: string | null
  data_inicio: string | null
}

type InicioClientProps = {
  nomeCompleto: string | null
  contrato: Contrato | null
}

const LOGO_URL = "https://exp-tour.com/wp-content/uploads/2026/04/EXP-Tour-Original-Logo.svg"

function saudacaoPorHorario(): string {
  const hora = new Date().getHours()
  if (hora < 12) return "Bom dia"
  if (hora < 18) return "Boa tarde"
  return "Boa noite"
}

function primeiroNome(nomeCompleto: string | null): string {
  if (!nomeCompleto) return ""
  return nomeCompleto.trim().split(" ")[0]
}

function diasAte(dataInicio: string | null): number | null {
  if (!dataInicio) return null
  const inicio = new Date(dataInicio + "T00:00:00")
  if (isNaN(inicio.getTime())) return null
  const hoje = new Date()
  const h0 = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())
  const diff = Math.round((inicio.getTime() - h0.getTime()) / 86400000)
  return diff
}

function formatarData(dataInicio: string | null): string {
  if (!dataInicio) return ""
  const d = new Date(dataInicio + "T00:00:00")
  if (isNaN(d.getTime())) return ""
  return d.toLocaleDateString("pt-BR")
}

const ETAPAS_JORNADA = [
  "Contrato",
  "Matricula",
  "Acomodacao",
  "Visto",
  "Pre-embarque",
  "Durante a viagem",
  "Retorno",
]

export default function InicioClient(props: InicioClientProps) {
  const nomeCompleto = props.nomeCompleto
  const contrato = props.contrato
  const nome = primeiroNome(nomeCompleto)
  const etapaAtualIndex = contrato ? 1 : 0
  const dias = diasAte(contrato ? contrato.data_inicio : null)

  return (
    <div className="min-h-screen bg-brand-cream/40 pb-28">
      <header className="flex items-center justify-between px-5 py-4">
        <img src={LOGO_URL} alt="EXP TOUR" className="h-6" />
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand text-sm font-medium text-brand-cream">
          {nome ? nome.charAt(0).toUpperCase() : "?"}
        </div>
      </header>

      <main className="mx-auto max-w-md px-5 py-2">
        <h1 className="font-serif text-4xl text-brand">
          {saudacaoPorHorario()}{nome ? ", " + nome : ""}
        </h1>
        <p className="mt-2 text-sm text-neutral-500">
          {contrato && contrato.nome ? contrato.nome : "Sua jornada com a EXP Tour"}
        </p>

        <div className="mt-6 rounded-3xl bg-brand p-6 text-brand-cream shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-gold">
            Inicio do curso
          </p>
          {dias !== null ? (
            <div>
              <p className="mt-3 font-serif text-6xl leading-none">{dias} dias</p>
              <p className="mt-3 text-sm text-brand-cream/80">
                para o inicio do seu curso &middot; {formatarData(contrato ? contrato.data_inicio : null)}
              </p>
            </div>
          ) : (
            <div>
              <p className="mt-3 font-serif text-3xl leading-tight">
                {contrato && contrato.nome ? contrato.nome : "Programa EXP Tour"}
              </p>
              <p className="mt-3 text-sm text-brand-cream/80">
                A data de inicio sera confirmada em breve.
              </p>
            </div>
          )}
          <div className="mt-5 border-t border-brand-cream/20 pt-4">
            <p className="flex items-center gap-2 text-sm text-brand-cream/90">
              <span className="inline-block h-2 w-2 rounded-full bg-brand-gold" />
              Esta tudo andando &mdash; {etapaAtualIndex} de {ETAPAS_JORNADA.length} etapas concluidas
            </p>
          </div>
        </div>

        <div className="mt-5 rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-gold">
            Seu proximo passo
          </p>
          <h2 className="mt-2 font-serif text-2xl text-brand">Acompanhe Financeiro e Docs</h2>
          <p className="mt-2 text-sm text-neutral-500">
            Veja suas parcelas, contratos e documentos nas abas Financeiro e Docs.
          </p>
          <Link
            href="/parcelas"
            className="mt-5 block rounded-xl bg-brand py-3 text-center text-sm font-medium text-brand-cream transition hover:opacity-90"
          >
            Ir para Financeiro
          </Link>
        </div>

        <div className="mt-5 rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="font-serif text-xl text-brand">Sua jornada</h2>
            <span className="text-xs text-neutral-400">
              {etapaAtualIndex} de {ETAPAS_JORNADA.length} concluidas
            </span>
          </div>
          <ol className="space-y-4">
            {ETAPAS_JORNADA.map(function (etapa, index) {
              const concluida = index < etapaAtualIndex
              const emAndamento = index === etapaAtualIndex
              const bolinha = concluida
                ? "bg-brand text-brand-cream"
                : emAndamento
                ? "border-2 border-brand text-brand"
                : "border border-neutral-300 text-transparent"
              const textoClasse = emAndamento ? "font-medium text-brand" : concluida ? "text-brand" : "text-neutral-400"
              return (
                <li key={etapa} className="flex items-center gap-3">
                  <span className={"flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-semibold " + bolinha}>
                    {concluida ? "✓" : ""}
                  </span>
                  <span className={"text-sm " + textoClasse}>
                    {etapa}{emAndamento ? " (em andamento)" : ""}
                  </span>
                </li>
              )
            })}
          </ol>
        </div>
      </main>

      <BottomNav />
    </div>
  )
}
