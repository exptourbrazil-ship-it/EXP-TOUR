"use client"

import { useState } from "react"
import Link from "next/link"
import BottomNav from "@/components/BottomNav"
import Cabecalho from "@/components/Cabecalho"
import SuporteRodape from "@/components/SuporteRodape"

type ItemEstado = {
  chave: string
  label: string
  tipo: "documento" | "tarefa"
  dica: string | null
  concluido: boolean
}

type Progresso = { total: number; concluidos: number; percentual: number }

type EmbarqueClientProps = {
  nomeExibicao: string | null
  contratoId: string | null
  itens: ItemEstado[]
  progresso: Progresso
}

const LOGO_URL = "https://exp-tour.com/wp-content/uploads/2026/04/EXP-Tour-Original-Logo.svg"

function primeiroNome(nome: string | null): string {
  if (!nome) return ""
  return nome.trim().split(" ")[0]
}

export default function EmbarqueClient(props: EmbarqueClientProps) {
  const nome = primeiroNome(props.nomeExibicao)
  const [itens, setItens] = useState<ItemEstado[]>(props.itens)
  const [salvando, setSalvando] = useState<string | null>(null)

  const concluidos = itens.filter((i) => i.concluido).length
  const total = itens.length
  const percentual = total === 0 ? 0 : Math.round((concluidos / total) * 100)

  async function alternarTarefa(item: ItemEstado) {
    if (item.tipo !== "tarefa" || salvando) return
    const novo = !item.concluido
    // Atualizacao otimista.
    setItens((lista) => lista.map((i) => (i.chave === item.chave ? { ...i, concluido: novo } : i)))
    setSalvando(item.chave)
    try {
      const resp = await fetch("/api/embarque/checklist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemChave: item.chave, contratoId: props.contratoId, concluido: novo }),
      })
      const json = await resp.json().catch(() => ({}))
      if (!resp.ok || !json.ok) {
        // Reverte em caso de falha.
        setItens((lista) => lista.map((i) => (i.chave === item.chave ? { ...i, concluido: !novo } : i)))
      }
    } catch {
      setItens((lista) => lista.map((i) => (i.chave === item.chave ? { ...i, concluido: !novo } : i)))
    } finally {
      setSalvando(null)
    }
  }

  return (
    <div className="min-h-screen bg-brand-cream/40 pb-28">
      <Cabecalho nome={props.nomeExibicao} subtitulo="Embarque" />

      <main className="mx-auto max-w-md px-5 py-2">
        <h1 className="font-serif text-4xl text-brand">Pronto para embarcar?</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Seu checklist de pré-embarque. Os itens de documento marcam sozinhos quando você os envia na aba Documentos.
        </p>

        {/* Barra de progresso */}
        <div className="mt-6 rounded-3xl bg-brand p-6 text-brand-cream shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-gold">
            Seu progresso
          </p>
          <p className="mt-3 font-serif text-5xl leading-none">
            {concluidos}<span className="text-2xl text-brand-cream/70"> de {total}</span>
          </p>
          <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-brand-cream/20">
            <div className="h-full rounded-full bg-brand-gold transition-all" style={{ width: percentual + "%" }} />
          </div>
          <p className="mt-2 text-sm text-brand-cream/80">
            {percentual === 100 ? "Tudo pronto! Boa viagem ✈" : percentual + "% concluído"}
          </p>
        </div>

        {/* Lista de itens */}
        <div className="mt-5 space-y-3">
          {itens.map((item) => {
            const isTarefa = item.tipo === "tarefa"
            return (
              <div
                key={item.chave}
                className="flex items-start gap-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm"
              >
                {isTarefa ? (
                  <button
                    onClick={() => alternarTarefa(item)}
                    aria-label={item.concluido ? "Desmarcar" : "Marcar"}
                    className={
                      "mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[12px] font-bold transition " +
                      (item.concluido
                        ? "bg-brand text-brand-cream"
                        : "border-2 border-neutral-300 text-transparent hover:border-brand")
                    }
                  >
                    {item.concluido ? "✓" : ""}
                  </button>
                ) : (
                  <span
                    title={item.concluido ? "Recebido no cofre" : "Aguardando envio na aba Docs"}
                    className={
                      "mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[12px] font-bold " +
                      (item.concluido ? "bg-brand text-brand-cream" : "border-2 border-dashed border-neutral-300 text-transparent")
                    }
                  >
                    {item.concluido ? "✓" : ""}
                  </span>
                )}

                <div className="min-w-0 flex-1">
                  <p className={"text-sm " + (item.concluido ? "text-neutral-500 line-through" : "text-brand")}>
                    {item.label}
                  </p>
                  {!item.concluido && item.tipo === "documento" ? (
                    <p className="mt-1 text-xs text-neutral-500">
                      {item.dica || "Será marcado quando o documento estiver no cofre."}{" "}
                      <Link href="/documentos" className="font-medium text-brand-golddark underline">Ir para Documentos</Link>
                    </p>
                  ) : null}
                  {!item.concluido && item.tipo === "tarefa" && item.dica ? (
                    <p className="mt-1 text-xs text-neutral-500">{item.dica}</p>
                  ) : null}
                </div>

                <span
                  title={isTarefa ? "Você marca este item" : "Marcado automaticamente a partir dos seus documentos"}
                  className="mt-0.5 shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-500"
                >
                  {isTarefa ? "você" : "auto"}
                </span>
              </div>
            )
          })}
        </div>
      </main>

      <SuporteRodape contexto="Dúvida sobre documentos, vistos ou o que levar? Fale com a gente." />

      <BottomNav />
    </div>
  )
}
