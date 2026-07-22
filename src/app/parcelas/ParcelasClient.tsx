"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import BottomNav from "@/components/BottomNav"

const LOGO_URL = "https://exp-tour.com/wp-content/uploads/2026/04/EXP-Tour-Original-Logo.svg"

type Parcela = {
  id: string
  numero: number
  descricao: string
  valor_original: number
  valor_atual: number
  cotacao_aplicada: number | null
  vencimento: string
  status: "pendente" | "pago" | "atrasado"
  is_entrada: boolean
  payment_link: string | null
  qr_code_url: string | null
  paid_at: string | null
  recibo_url?: string | null
  moeda: string
  cotacaoEstimada?: number | null
  valorEstimadoBRL?: number | null
}

type LinhaEdicao = {
  id?: string
  descricao: string
  valor: string
  vencimento: string
  bloqueada: boolean
}

function formatarMoeda(valor: number, moeda: string): string {
  try {
    return valor.toLocaleString("pt-BR", { style: "currency", currency: moeda })
  } catch {
    return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
  }
}

function CopiarPix({ codigo }: { codigo: string }) {
  const [copiado, setCopiado] = useState(false)
  async function copiar() {
    let ok = false
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(codigo)
        ok = true
      }
    } catch {
      ok = false
    }
    if (!ok) {
      try {
        const ta = document.createElement("textarea")
        ta.value = codigo
        ta.style.position = "fixed"
        ta.style.left = "-9999px"
        document.body.appendChild(ta)
        ta.focus()
        ta.select()
        document.execCommand("copy")
        document.body.removeChild(ta)
        ok = true
      } catch {
        ok = false
      }
    }
    if (ok) {
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2500)
    }
  }
  return (
    <div className="w-full">
      <p className="mb-1 text-xs text-neutral-500">Pix copia e cola</p>
      <div className="flex items-start gap-2">
        <textarea
          readOnly
          value={codigo}
          onFocus={(e) => e.currentTarget.select()}
          className="h-20 flex-1 resize-none rounded-lg border border-neutral-200 bg-neutral-50 p-2 text-xs text-neutral-600"
        />
        <button
          onClick={copiar}
          className="shrink-0 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-cream"
        >
          {copiado ? "Copiado!" : "Copiar"}
        </button>
      </div>
    </div>
  )
}

function AjustarParcelas({ parcelas, contratoId, dataInicio, moeda, onFechar, onSalvo }: { parcelas: Parcela[]; contratoId: string; dataInicio: string | null; moeda: string; onFechar: () => void; onSalvo: () => void }) {
  const iniciais: LinhaEdicao[] = parcelas.map((p) => ({
    id: p.id,
    descricao: p.descricao,
    valor: String(p.valor_original),
    vencimento: p.vencimento ? p.vencimento.slice(0, 10) : "",
    bloqueada: p.status === "pago" || !!p.qr_code_url,
  }))
  const [linhas, setLinhas] = useState<LinhaEdicao[]>(iniciais)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const limite30 = (() => {
    if (!dataInicio) return null
    const inicio = new Date(dataInicio + "T00:00:00")
    const limite = new Date(inicio)
    limite.setDate(limite.getDate() - 30)
    return limite
  })()

  function atualizar(index: number, campo: keyof LinhaEdicao, valor: string) {
    setLinhas((atual) => atual.map((l, i) => (i === index ? { ...l, [campo]: valor } : l)))
  }
  function remover(index: number) {
    setLinhas((atual) => atual.filter((_, i) => i !== index))
  }
  function adicionar() {
    setLinhas((atual) => [...atual, { descricao: "Nova parcela", valor: "", vencimento: "", bloqueada: false }])
  }

  const total = linhas.reduce((soma, l) => soma + (Number(l.valor) || 0), 0)

  async function salvar() {
    setErro(null)
    for (const l of linhas) {
      if (!l.descricao || !l.vencimento || !(Number(l.valor) > 0)) {
        setErro("Cada parcela precisa de descricao, valor maior que zero e data de vencimento.")
        return
      }
    }
    if (limite30) {
      const ultimo = linhas
        .map((l) => new Date(l.vencimento + "T00:00:00"))
        .reduce((max, d) => (d > max ? d : max), new Date(0))
      if (ultimo > limite30) {
        setErro("O ultimo pagamento precisa ser ate " + limite30.toISOString().slice(0, 10) + " (30 dias antes do inicio do programa).")
        return
      }
    }
    setSalvando(true)
    try {
      const payload = {
        contratoId,
        parcelas: linhas.map((l, i) => ({
          id: l.id,
          numero: i + 1,
          descricao: l.descricao,
          valor: Number(l.valor),
          vencimento: l.vencimento,
        })),
      }
      const resp = await fetch("/api/parcelas/ajustar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const resultado = await resp.json()
      if (resultado.ok) {
        onSalvo()
      } else {
        setErro(resultado.erro || "Nao foi possivel salvar as alteracoes.")
      }
    } catch {
      setErro("Nao foi possivel salvar as alteracoes.")
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div className="my-6 w-full max-w-lg rounded-3xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-2xl text-brand">Ajustar parcelas</h2>
          <button onClick={onFechar} className="text-sm text-neutral-500 underline">Fechar</button>
        </div>
        {limite30 ? (
          <p className="mt-2 text-sm text-neutral-500">
            O ultimo pagamento precisa ser ate 30 dias antes do inicio do programa ({limite30.toLocaleDateString("pt-BR")}).
          </p>
        ) : null}
        <div className="mt-4 space-y-3">
          {linhas.map((l, index) => (
            <div key={l.id || "nova-" + index} className="rounded-2xl border border-neutral-200 p-3">
              {l.bloqueada ? (
                <p className="mb-2 text-xs font-medium text-neutral-400">Parcela ja paga ou com Pix gerado - nao pode ser alterada</p>
              ) : null}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <label className="flex-1 text-xs text-neutral-500">
                  Descricao
                  <input
                    type="text"
                    value={l.descricao}
                    disabled={l.bloqueada}
                    onChange={(e) => atualizar(index, "descricao", e.target.value)}
                    className="mt-1 w-full rounded-lg border border-neutral-200 p-2 text-sm text-neutral-800 disabled:bg-neutral-100"
                  />
                </label>
                <label className="text-xs text-neutral-500 sm:w-28">
                  Valor ({moeda})
                  <input
                    type="number"
                    value={l.valor}
                    disabled={l.bloqueada}
                    onChange={(e) => atualizar(index, "valor", e.target.value)}
                    className="mt-1 w-full rounded-lg border border-neutral-200 p-2 text-sm text-neutral-800 disabled:bg-neutral-100"
                  />
                </label>
                <label className="text-xs text-neutral-500 sm:w-40">
                  Vencimento
                  <input
                    type="date"
                    value={l.vencimento}
                    disabled={l.bloqueada}
                    onChange={(e) => atualizar(index, "vencimento", e.target.value)}
                    className="mt-1 w-full rounded-lg border border-neutral-200 p-2 text-sm text-neutral-800 disabled:bg-neutral-100"
                  />
                </label>
                {!l.bloqueada ? (
                  <button onClick={() => remover(index)} className="text-sm text-red-500 underline sm:pb-2">Excluir</button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
        <button onClick={adicionar} className="mt-3 rounded-xl border border-neutral-300 px-4 py-2 text-sm text-brand">+ Adicionar parcela</button>
        {erro ? <p className="mt-3 text-sm text-red-600">{erro}</p> : null}
        <div className="mt-4 flex items-center justify-between border-t border-neutral-200 pt-4">
          <span className="text-sm font-medium text-neutral-700">Total: {formatarMoeda(total, moeda)}</span>
          <div className="flex gap-2">
            <button onClick={onFechar} className="rounded-xl border border-neutral-300 px-4 py-2 text-sm text-neutral-600">Cancelar</button>
            <button onClick={salvar} disabled={salvando} className="rounded-xl bg-brand px-5 py-2 text-sm font-medium text-brand-cream disabled:opacity-50">
              {salvando ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ParcelasClient({ parcelas, programaNome, totalPrograma, pagoAteAgora, contratoId, dataInicio }: { parcelas: Parcela[]; programaNome?: string | null; totalPrograma?: number; pagoAteAgora?: number; contratoId?: string | null; dataInicio?: string | null }) {
  const router = useRouter()
  const [erro, setErro] = useState<string | null>(null)
  const [gerando, setGerando] = useState<string | null>(null)
  const [editando, setEditando] = useState(false)
  const [restaurando, setRestaurando] = useState(false)

  async function gerarCobranca(parcelaId: string) {
    setGerando(parcelaId)
    setErro(null)
    try {
      const response = await fetch("/api/parcelas/" + parcelaId + "/gerar-cobranca", { method: "POST" })
      const resultado = await response.json()
      if (resultado.ok) {
        router.refresh()
      } else {
        setErro(resultado.erro || "Nao foi possivel gerar a cobranca Pix.")
      }
    } catch {
      setErro("Nao foi possivel gerar a cobranca Pix.")
    } finally {
      setGerando(null)
    }
  }

  async function restaurarPlano() {
    if (!contratoId) return
    const confirmado = window.confirm("Restaurar o plano original de parcelas? Isso desfaz suas alteracoes e volta a proposta inicial. Parcelas ja pagas ou com Pix gerado impedem a restauracao.")
    if (!confirmado) return
    setRestaurando(true)
    setErro(null)
    try {
      const resp = await fetch("/api/parcelas/restaurar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contratoId }),
      })
      const resultado = await resp.json()
      if (resultado.ok) {
        router.refresh()
      } else {
        setErro(resultado.erro || "Nao foi possivel restaurar o plano original.")
      }
    } catch {
      setErro("Nao foi possivel restaurar o plano original.")
    } finally {
      setRestaurando(false)
    }
  }

  async function sair() {
    await fetch("/api/auth/logout", { method: "POST" })
    window.location.href = "/"
  }

  const moedaPrograma = parcelas.length > 0 ? parcelas[0].moeda : "BRL"
  const percentualPago = totalPrograma && totalPrograma > 0 ? Math.min(100, Math.round(((pagoAteAgora || 0) / totalPrograma) * 100)) : 0
  const proximaParcela = parcelas.find((p) => p.status !== "pago") || null
  const nome = programaNome || null

  return (
    <div className="min-h-screen bg-brand-cream/40 pb-28">
      <header className="flex items-center justify-between px-5 py-4">
        <img src={LOGO_URL} alt="EXP TOUR" className="h-6" />
        <button onClick={sair} className="text-sm text-neutral-500 underline">Sair</button>
      </header>

      <main className="mx-auto max-w-md px-5 py-2">
        <h1 className="font-serif text-4xl text-brand">Financeiro</h1>
        {nome ? <p className="mt-2 text-sm text-neutral-500">{nome}</p> : null}
        {totalPrograma && totalPrograma > 0 ? (
          <p className="text-sm text-neutral-500">Contrato de {formatarMoeda(totalPrograma, moedaPrograma)}</p>
        ) : null}

        {totalPrograma && totalPrograma > 0 ? (
          <div className="mt-6 rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-neutral-500">Pago ate agora</p>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="font-serif text-4xl text-green-700">{formatarMoeda(pagoAteAgora || 0, moedaPrograma)}</span>
              <span className="text-sm text-neutral-500">{percentualPago}% do programa</span>
            </div>
            <div className="mt-4 h-2 w-full rounded-full bg-neutral-100">
              <div className="h-2 rounded-full bg-green-600" style={{ width: percentualPago + "%" }} />
            </div>
          </div>
        ) : null}

        {erro ? <p className="mt-4 text-sm text-red-600">{erro}</p> : null}

        <div className="mt-6 rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-serif text-2xl text-brand">Parcelas</h2>
            {contratoId ? (
              <div className="flex items-center gap-4">
                <button onClick={() => setEditando(true)} className="text-sm font-medium text-brand underline">Ajustar parcelas</button>
                <button onClick={restaurarPlano} disabled={restaurando} className="text-sm font-medium text-neutral-500 underline disabled:opacity-50">{restaurando ? "Restaurando..." : "Restaurar plano original"}</button>
              </div>
            ) : null}
          </div>

          <div className="space-y-3">
            {parcelas.map((parcela) => {
              const moeda = parcela.moeda || "BRL"
              const emMoedaEstrangeira = moeda !== "BRL"
              const cobrancaJaGerada = !!parcela.qr_code_url
              const paga = parcela.status === "pago"
              const ehProxima = !paga && proximaParcela?.id === parcela.id

              return (
                <div
                  key={parcela.id}
                  className={ehProxima ? "rounded-2xl border border-brand-gold/50 bg-brand-cream/50 p-4" : "rounded-2xl border border-neutral-100 bg-white p-4"}
                >
                  {ehProxima ? (
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-brand-gold">
                      Proxima &middot; {new Date(parcela.vencimento).toLocaleDateString("pt-BR")}
                    </p>
                  ) : null}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <span className={paga ? "mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-600 text-xs text-white" : "mt-1 h-6 w-6 shrink-0 rounded-full border-2 border-neutral-300"}>
                        {paga ? "✓" : ""}
                      </span>
                      <div>
                        <div className="font-medium text-brand">{parcela.descricao}</div>
                        <div className="text-xs text-neutral-400">
                          {paga ? "Paga em " + new Date(parcela.paid_at || parcela.vencimento).toLocaleDateString("pt-BR") : "Vencimento " + new Date(parcela.vencimento).toLocaleDateString("pt-BR")}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium text-brand">{formatarMoeda(Number(parcela.valor_original), moeda)}</div>
                      {emMoedaEstrangeira && cobrancaJaGerada ? (
                        <div className="text-xs text-neutral-500">Voce paga: {formatarMoeda(Number(parcela.valor_atual), "BRL")} (VET: {parcela.cotacao_aplicada ?? "-"})</div>
                      ) : null}
                      {emMoedaEstrangeira && !cobrancaJaGerada && !paga ? (
                        <div className="text-xs text-neutral-400">
                          {parcela.valorEstimadoBRL ? "Equivalente hoje: " + formatarMoeda(parcela.valorEstimadoBRL, "BRL") + " (estimativa)" : "BRL calculado ao gerar o Pix."}
                        </div>
                      ) : null}
                      <div className="mt-1">
                        {paga ? (
                          parcela.recibo_url ? (
                            <a href={parcela.recibo_url} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-brand underline">Ver recibo</a>
                          ) : (
                            <span className="cursor-not-allowed text-xs text-neutral-300" title="O recibo ficara disponivel em breve">Recibo em breve</span>
                          )
                        ) : parcela.qr_code_url ? (
                          <span className="text-xs font-medium text-brand">QR Code abaixo</span>
                        ) : (
                          <button
                            onClick={() => gerarCobranca(parcela.id)}
                            disabled={gerando === parcela.id}
                            className={ehProxima ? "rounded-full bg-brand px-4 py-2 text-sm font-medium text-brand-cream shadow-sm disabled:opacity-50" : "text-sm font-medium text-brand underline disabled:opacity-50"}
                          >
                            {gerando === parcela.id ? "Gerando..." : ehProxima ? "Gerar Pix" : "Pagar antecipadamente"}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                  {!paga && parcela.qr_code_url ? (
                    <div className="mt-4 flex flex-col items-center gap-2 border-t border-neutral-100 pt-4">
                      <img src={parcela.qr_code_url} alt="QR Code Pix" className="h-40 w-40" />
                      {parcela.payment_link ? <CopiarPix codigo={parcela.payment_link} /> : null}
                      <span className="mt-1 text-xs text-neutral-400">O status sera atualizado automaticamente apos a confirmacao do pagamento.</span>
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>
      </main>

      {editando && contratoId ? (
        <AjustarParcelas
          parcelas={parcelas}
          contratoId={contratoId}
          dataInicio={dataInicio || null}
          moeda={moedaPrograma}
          onFechar={() => setEditando(false)}
          onSalvo={() => {
            setEditando(false)
            router.refresh()
          }}
        />
      ) : null}

      <BottomNav />
    </div>
  )
}
