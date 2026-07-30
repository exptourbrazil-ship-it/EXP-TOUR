"use client"

import Link from "next/link"
import BottomNav from "@/components/BottomNav"
import Cabecalho from "@/components/Cabecalho"
import SuporteRodape from "@/components/SuporteRodape"
import { calcularJornada, indiceEtapaAtual, totalConcluidas, type EstadoEtapa } from "@/lib/jornada"

type Contrato = {
  id: string
  nome: string | null
  valor_total: number | null
  moeda: string | null
  data_inicio: string | null
  estudante_nome?: string | null
}

type InicioClientProps = {
  nomeCompleto: string | null
  contrato: Contrato | null
  dataInicioTitular?: string | null
  documentosEnviados?: number
  parcelasPagas?: number
  parcelasTotal?: number
}

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

// Para cada etapa da jornada, para onde o cliente deve ir agora.
const CTA_POR_ETAPA: Record<string, { rotulo: string; href: string }> = {
  Contrato: { rotulo: "Ver Financeiro", href: "/parcelas" },
  Documentos: { rotulo: "Enviar documentos", href: "/documentos" },
  Pagamentos: { rotulo: "Ver parcelas", href: "/parcelas" },
  "Pré-embarque": { rotulo: "Ver checklist", href: "/embarque" },
  "Durante a viagem": { rotulo: "Abrir Viagem", href: "/viagem" },
  Retorno: { rotulo: "Abrir Retorno", href: "/retorno" },
}

export default function InicioClient(props: InicioClientProps) {
  const nomeCompleto = props.nomeCompleto
  const contrato = props.contrato
  // Saudacao/avatar usam o nome do ESTUDANTE (o app acompanha a jornada dele);
  // se o contrato ainda nao tem estudante_nome, cai para o nome do titular.
  const nomeExibicao = (contrato && contrato.estudante_nome) ? contrato.estudante_nome : nomeCompleto
  const nome = primeiroNome(nomeExibicao)
  const dataInicioEfetiva = (contrato && contrato.data_inicio) ? contrato.data_inicio : (props.dataInicioTitular || null)
  const dias = diasAte(dataInicioEfetiva)

  const etapas = calcularJornada({
    temContrato: !!contrato,
    documentosEnviados: props.documentosEnviados || 0,
    parcelasPagas: props.parcelasPagas || 0,
    parcelasTotal: props.parcelasTotal || 0,
    diasAteInicio: dias,
  })
  const atualIdx = indiceEtapaAtual(etapas)
  const concluidas = totalConcluidas(etapas)
  const etapaAtual = atualIdx < etapas.length ? etapas[atualIdx] : null
  const cta = etapaAtual ? (CTA_POR_ETAPA[etapaAtual.nome] || CTA_POR_ETAPA.Pagamentos) : { rotulo: "Abrir Retorno", href: "/retorno" }

  const bolinhaPorEstado: Record<EstadoEtapa, string> = {
    concluida: "bg-brand text-brand-cream",
    andamento: "border-2 border-brand text-brand",
    pendente: "border border-neutral-300 text-transparent",
  }
  const textoPorEstado: Record<EstadoEtapa, string> = {
    concluida: "text-brand",
    andamento: "font-medium text-brand",
    pendente: "text-neutral-500",
  }

  return (
    <div className="min-h-screen bg-brand-cream/40 pb-28 lg:pb-10 lg:pl-60">
      <Cabecalho nome={nomeExibicao} subtitulo={contrato && contrato.nome ? contrato.nome : null} />

      <main className="mx-auto w-full max-w-md px-5 py-2 md:max-w-2xl md:px-8 lg:max-w-5xl">
        <h1 className="font-serif text-4xl text-brand md:text-5xl">
          {saudacaoPorHorario()}{nome ? ", " + nome : ""}
        </h1>
        <p className="mt-2 text-sm text-neutral-600">
          {contrato && contrato.nome ? contrato.nome : "Sua jornada com a EXP Tour"}
        </p>

        <div className="mt-6 lg:grid lg:grid-cols-2 lg:gap-6 lg:items-start">
          <div className="space-y-5">
          <div className="animate-fade-in-up rounded-3xl bg-brand p-6 text-brand-cream shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-gold">
            Início do curso
          </p>
          {dias !== null ? (
            <div>
              <p className="mt-3 font-serif text-6xl leading-none">
                {dias > 0 ? dias + " dias" : dias === 0 ? "É hoje!" : "Em andamento"}
              </p>
              <p className="mt-3 text-sm text-brand-cream/80">
                {dias > 0
                  ? "para o início do seu curso · " + formatarData(dataInicioEfetiva)
                  : "início em " + formatarData(dataInicioEfetiva)}
              </p>
            </div>
          ) : (
            <div>
              <p className="mt-3 font-serif text-3xl leading-tight">
                {contrato && contrato.nome ? contrato.nome : "Programa EXP Tour"}
              </p>
              <p className="mt-3 text-sm text-brand-cream/80">
                A data de início será confirmada em breve.
              </p>
            </div>
          )}
          <div className="mt-5 border-t border-brand-cream/20 pt-4">
            <p className="flex items-center gap-2 text-sm text-brand-cream/90">
              <span className="inline-block h-2 w-2 rounded-full bg-brand-gold" />
              {concluidas} de {etapas.length} etapas concluídas
            </p>
          </div>
        </div>

          <div className="animate-fade-in-up rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-golddark">
            Seu próximo passo
          </p>
          <h2 className="mt-2 font-serif text-2xl text-brand">
            {etapaAtual ? etapaAtual.nome : "Tudo em dia por aqui"}
          </h2>
          <p className="mt-2 text-sm text-neutral-600">
            {etapaAtual ? etapaAtual.descricao : "Você concluiu as etapas registradas. Qualquer novidade aparece aqui."}
          </p>
          <Link
            href={cta.href}
            className="mt-5 block rounded-xl bg-brand py-3 text-center text-sm font-medium text-brand-cream transition hover:opacity-90"
          >
            {cta.rotulo}
          </Link>
          </div>
          </div>

          <div className="mt-5 lg:mt-0">
          <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="font-serif text-xl text-brand">Sua jornada</h2>
            <span className="text-xs text-neutral-500">
              {concluidas} de {etapas.length}
            </span>
          </div>
          <p className="mb-5 text-xs text-neutral-500">Seu progresso real, atualizado conforme você avança.</p>
          <ol className="space-y-4">
            {etapas.map((etapa) => (
              <li key={etapa.nome} className="flex items-start gap-3">
                <span
                  className={
                    "mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-semibold " +
                    bolinhaPorEstado[etapa.estado]
                  }
                >
                  {etapa.estado === "concluida" ? "✓" : ""}
                </span>
                <div>
                  <p className={"text-sm " + textoPorEstado[etapa.estado]}>
                    {etapa.nome}
                    {etapa.estado === "andamento" ? " (em andamento)" : ""}
                  </p>
                  <p className="text-xs text-neutral-500">{etapa.descricao}</p>
                </div>
              </li>
            ))}
          </ol>
          </div>
          </div>
        </div>
      </main>

      <SuporteRodape contexto="Dúvidas sobre seu programa, documentos ou pagamentos? Fale com a gente." />

      <BottomNav />
    </div>
  )
}
