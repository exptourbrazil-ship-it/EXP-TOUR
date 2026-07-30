"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import BottomNav from "@/components/BottomNav"
import Cabecalho from "@/components/Cabecalho"
import SuporteRodape from "@/components/SuporteRodape"
import { somaParcelasConfere, somaValoresParcelas } from "@/lib/parcelas"

const LOGO_URL = "https://exp-tour.com/wp-content/uploads/2026/04/EXP-Tour-Original-Logo.svg"

type Parcela = {
  id: string
  numero: number
  descricao: string
  valor_original: number
  valor_atual: number
  valor_cobrado_brl: number | null
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
// Valor efetivo da parcela na moeda do programa, ja com os ajustes do cliente.
// `valor_atual` guarda SEMPRE a moeda do programa; o BRL cobrado no Pix vive em
// `valor_cobrado_brl`.
function valorProgramaAtual(p: { valor_atual: number }): number {
  return Number(p.valor_atual)
}

function formatarMoeda(valor: number, moeda: string): string {
  try {
    return valor.toLocaleString("pt-BR", { style: "currency", currency: moeda })
  } catch {
    return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
  }
}

// Formata data para pt-BR sem deslocar o dia por fuso horario. Uma string
// "YYYY-MM-DD" (vencimento) precisa ser interpretada no fuso LOCAL; caso
// contrario `new Date("2026-08-05")` vira meia-noite UTC e, em BRT (UTC-3),
// exibe o dia anterior (04/08). Timestamps completos (paid_at) sao usados como vem.
function formatarDataBR(valor: string): string {
  const soData = /^\d{4}-\d{2}-\d{2}$/.test(valor)
  return new Date(soData ? valor + "T00:00:00" : valor).toLocaleDateString("pt-BR")
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

function AjustarParcelas({ parcelas, contratoId, dataInicio, moeda, valorTotalContrato, onFechar, onSalvo }: { parcelas: Parcela[]; contratoId: string; dataInicio: string | null; moeda: string; valorTotalContrato?: number; onFechar: () => void; onSalvo: () => void }) {
  const iniciais: LinhaEdicao[] = parcelas.map((p) => ({
    id: p.id,
    descricao: p.descricao,
    valor: String(valorProgramaAtual(p)),
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

  const total = somaValoresParcelas(linhas.map((l) => Number(l.valor) || 0))
  // Alvo de conferencia = valor_total do contrato (mesma regra do servidor).
  // Quando o contrato nao tem valor_total (legado), a conferencia fica inativa.
  const conferirSoma = !!valorTotalContrato && valorTotalContrato > 0
  const somaConfere = conferirSoma ? somaParcelasConfere(linhas.map((l) => Number(l.valor) || 0), valorTotalContrato as number) : true

  async function salvar() {
    setErro(null)
    for (const l of linhas) {
      if (!l.descricao || !l.vencimento || !(Number(l.valor) > 0)) {
        setErro("Cada parcela precisa de descrição, valor maior que zero e data de vencimento.")
        return
      }
    }
    if (conferirSoma && !somaConfere) {
      setErro(`A soma das parcelas (${formatarMoeda(total, moeda)}) precisa ser igual ao total do contrato (${formatarMoeda(valorTotalContrato as number, moeda)}).`)
      return
    }
    if (limite30) {
      const ultimo = linhas
        .map((l) => new Date(l.vencimento + "T00:00:00"))
        .reduce((max, d) => (d > max ? d : max), new Date(0))
      if (ultimo > limite30) {
        setErro("O último pagamento precisa ser até " + limite30.toISOString().slice(0, 10) + " (30 dias antes do início do programa).")
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
        setErro(resultado.erro || "Não foi possível salvar as alterações.")
      }
    } catch {
      setErro("Não foi possível salvar as alterações.")
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div className="my-6 w-full max-w-lg animate-scale-in rounded-3xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-2xl text-brand">Ajustar parcelas</h2>
          <button onClick={onFechar} className="text-sm text-neutral-500 underline">Fechar</button>
        </div>
        <p className="mt-1 text-sm text-neutral-500">Edite valores e datas das parcelas ainda em aberto. A soma precisa bater com o total do contrato.</p>
        {limite30 ? (
          <p className="mt-2 text-sm text-neutral-500">
            O último pagamento precisa ser até 30 dias antes do início do programa ({limite30.toLocaleDateString("pt-BR")}).
          </p>
        ) : null}
        <div className="mt-4 space-y-3">
          {linhas.map((l, index) => (
            <div key={l.id || "nova-" + index} className="rounded-2xl border border-neutral-200 p-3">
              {l.bloqueada ? (
                <p className="mb-2 text-xs font-medium text-neutral-500">Parcela já paga ou com Pix gerado — não pode ser alterada</p>
              ) : null}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <label className="flex-1 text-xs text-neutral-500">
                  Descrição
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
        {conferirSoma && !somaConfere ? (
          <p className="mt-3 text-sm text-red-600">
            A soma das parcelas ({formatarMoeda(total, moeda)}) precisa ser igual ao total do contrato ({formatarMoeda(valorTotalContrato as number, moeda)}).
          </p>
        ) : null}
        <div className="mt-4 flex items-center justify-between border-t border-neutral-200 pt-4">
          <span className="text-sm font-medium text-neutral-700">
            Total: {formatarMoeda(total, moeda)}
            {conferirSoma ? <span className="text-neutral-500"> / {formatarMoeda(valorTotalContrato as number, moeda)}</span> : null}
          </span>
          <div className="flex gap-2">
            <button onClick={onFechar} className="rounded-xl border border-neutral-300 px-4 py-2 text-sm text-neutral-600">Cancelar</button>
            <button onClick={salvar} disabled={salvando || (conferirSoma && !somaConfere)} className="rounded-xl bg-brand px-5 py-2 text-sm font-medium text-brand-cream disabled:opacity-50">
              {salvando ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ParcelasClient({ parcelas, programaNome, totalPrograma, pagoAteAgora, contratoId, dataInicio, valorTotalContrato, nomeCliente, saldoMoeda, saldoBRLhoje, quitarAte, antecipacoes }: { parcelas: Parcela[]; programaNome?: string | null; totalPrograma?: number; pagoAteAgora?: number; contratoId?: string | null; dataInicio?: string | null; valorTotalContrato?: number; nomeCliente?: string | null; saldoMoeda?: number; saldoBRLhoje?: number | null; quitarAte?: string | null; antecipacoes?: Array<{ id: string; documento: string; justificativa: string | null; valor: number; moeda: string; data_limite: string; comprovante_url: string | null }> }) {
  const router = useRouter()
  const [erro, setErro] = useState<string | null>(null)
  const [gerando, setGerando] = useState<string | null>(null)
  const [editando, setEditando] = useState(false)
  const [restaurando, setRestaurando] = useState(false)
  const [cancelando, setCancelando] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  function mostrarAviso(mensagem: string) {
    setAviso(mensagem)
    setTimeout(() => setAviso(null), 3500)
  }

  async function gerarCobranca(parcelaId: string) {
    setGerando(parcelaId)
    setErro(null)
    try {
      const response = await fetch("/api/parcelas/" + parcelaId + "/gerar-cobranca", { method: "POST" })
      const resultado = await response.json()
      if (resultado.ok) {
        mostrarAviso("Pix gerado. Escaneie o QR Code abaixo.")
        router.refresh()
      } else {
        setErro(resultado.erro || "Não foi possível gerar a cobrança Pix.")
      }
    } catch {
      setErro("Não foi possível gerar a cobrança Pix.")
    } finally {
      setGerando(null)
    }
  }

  async function cancelarCobranca(parcelaId: string) {
    const confirmado = window.confirm("Cancelar esta cobrança Pix e voltar a parcela para 'em aberto'? Você poderá editá-la ou gerar o Pix novamente depois.")
    if (!confirmado) return
    setCancelando(parcelaId)
    setErro(null)
    try {
      const response = await fetch("/api/parcelas/" + parcelaId + "/cancelar-cobranca", { method: "POST" })
      const resultado = await response.json()
      if (resultado.ok) {
        mostrarAviso("Cobrança cancelada. A parcela voltou para em aberto.")
        router.refresh()
      } else {
        setErro(resultado.erro || "Não foi possível cancelar a cobrança.")
      }
    } catch {
      setErro("Não foi possível cancelar a cobrança.")
    } finally {
      setCancelando(null)
    }
  }

  async function restaurarPlano() {
    if (!contratoId) return
    const confirmado = window.confirm("Restaurar o plano original de parcelas? Isso desfaz suas alterações e volta à proposta inicial. Parcelas já pagas ou com Pix gerado impedem a restauração.")
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
        mostrarAviso("Plano original restaurado.")
        router.refresh()
      } else {
        setErro(resultado.erro || "Não foi possível restaurar o plano original.")
      }
    } catch {
      setErro("Não foi possível restaurar o plano original.")
    } finally {
      setRestaurando(false)
    }
  }

  const moedaPrograma = parcelas.length > 0 ? parcelas[0].moeda : "BRL"
  const percentualPago = totalPrograma && totalPrograma > 0 ? Math.min(100, Math.round(((pagoAteAgora || 0) / totalPrograma) * 100)) : 0
  const proximaParcela = parcelas.find((p) => p.status !== "pago") || null
  const nome = programaNome || null
  const temMoedaEstrangeira = parcelas.some((p) => (p.moeda || "BRL") !== "BRL")
  const hojeMeiaNoite = new Date()
  hojeMeiaNoite.setHours(0, 0, 0, 0)

  return (
    <div className="min-h-screen bg-brand-cream/40 pb-28 lg:pb-10 lg:pl-60">
      <Cabecalho nome={nomeCliente || null} subtitulo={nome} />

      <main className="mx-auto w-full max-w-md px-5 py-2 md:max-w-2xl md:px-8">
        <h1 className="font-serif text-4xl text-brand md:text-5xl">Financeiro</h1>
        <p className="mt-2 text-sm text-neutral-600">
          {nome ? nome + " · " : ""}Acompanhe suas parcelas, gere o Pix e veja o que já foi pago.
        </p>
        {totalPrograma && totalPrograma > 0 ? (
          <p className="text-sm text-neutral-500">Contrato de {formatarMoeda(totalPrograma, moedaPrograma)}</p>
        ) : null}

        {antecipacoes && antecipacoes.length > 0 ? (
          <div className="mt-6 space-y-3">
            {antecipacoes.map((a) => (
              <div key={a.id} className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-amber-800">
                  Antecipação exigida
                </p>
                <p className="mt-1 text-sm text-brand">
                  Para emitir <strong>{a.documento}</strong>, é necessário antecipar{" "}
                  <strong>{formatarMoeda(Number(a.valor), a.moeda)}</strong> até{" "}
                  <strong>{formatarDataBR(a.data_limite)}</strong>.
                </p>
                {a.justificativa ? (
                  <p className="mt-1 text-xs text-neutral-600">{a.justificativa}</p>
                ) : null}
                {a.comprovante_url ? (
                  <a
                    href={a.comprovante_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-block text-xs font-medium text-amber-800 hover:underline"
                  >
                    ver o comprovante da exigência
                  </a>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        {totalPrograma && totalPrograma > 0 ? (
          <div className="mt-6 rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-golddark">Pago até agora</p>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="font-serif text-4xl text-brand">{formatarMoeda(pagoAteAgora || 0, moedaPrograma)}</span>
              <span className="text-sm text-neutral-500">{percentualPago}% do programa</span>
            </div>
            <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-neutral-100">
              <div className="h-2 rounded-full bg-brand transition-all duration-500" style={{ width: percentualPago + "%" }} />
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-neutral-100 pt-3 text-sm">
              <span className="text-neutral-500">Saldo devedor</span>
              <span className="font-medium text-brand">
                {formatarMoeda(saldoMoeda ?? Math.max(0, (totalPrograma || 0) - (pagoAteAgora || 0)), moedaPrograma)}
              </span>
            </div>
            {saldoBRLhoje != null ? (
              <div className="mt-1 flex items-center justify-between text-xs text-neutral-500">
                <span>Para quitar hoje (cotação do dia)</span>
                <span className="font-medium text-brand-golddark">≈ {formatarMoeda(saldoBRLhoje, "BRL")}</span>
              </div>
            ) : null}
            {quitarAte ? (
              <div className="mt-3 flex items-center justify-between border-t border-neutral-100 pt-3 text-sm">
                <span className="text-neutral-500">Quitar até</span>
                <span className="font-medium text-brand">{formatarDataBR(quitarAte)}</span>
              </div>
            ) : null}
            <p className="mt-3 text-[11px] text-neutral-400">
              O saldo é na moeda do programa; o valor em Reais é uma estimativa pela cotação do dia
              e só se confirma na geração de cada Pix.
            </p>
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
              const venc = new Date(parcela.vencimento + "T00:00:00")
              const atrasada = !paga && !cobrancaJaGerada && !isNaN(venc.getTime()) && venc < hojeMeiaNoite

              const containerClasse = atrasada
                ? "rounded-2xl border border-red-200 bg-red-50/60 p-4 card-interativo"
                : ehProxima
                ? "rounded-2xl border border-brand-gold/50 bg-brand-cream/50 p-4 card-interativo"
                : "rounded-2xl border border-neutral-100 bg-white p-4 card-interativo"

              return (
                <div key={parcela.id} className={containerClasse}>
                  {atrasada ? (
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-red-600">
                      Atrasada &middot; venceu {formatarDataBR(parcela.vencimento)}
                    </p>
                  ) : ehProxima ? (
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-brand-golddark">
                      Próxima &middot; {formatarDataBR(parcela.vencimento)}
                    </p>
                  ) : null}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <span className={paga ? "mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand text-xs text-brand-cream" : "mt-1 h-6 w-6 shrink-0 rounded-full border-2 border-neutral-300"}>
                        {paga ? "✓" : ""}
                      </span>
                      <div>
                        <div className="font-medium text-brand">{parcela.descricao}</div>
                        <div className={"text-xs " + (atrasada ? "text-red-600" : "text-neutral-500")}>
                          {paga ? "Paga em " + formatarDataBR(parcela.paid_at || parcela.vencimento) : "Vencimento " + formatarDataBR(parcela.vencimento)}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                                           <div className="font-medium text-brand">{formatarMoeda(valorProgramaAtual(parcela), moeda)}</div>   
                      {emMoedaEstrangeira && cobrancaJaGerada ? (
                        <div className="text-xs text-neutral-500">Você paga: {formatarMoeda(Number(parcela.valor_cobrado_brl ?? 0), "BRL")} <span className="text-neutral-500">(VET {parcela.cotacao_aplicada ?? "-"})</span></div>
                      ) : null}
                      {emMoedaEstrangeira && !cobrancaJaGerada && !paga ? (
                        <div className="text-xs text-neutral-500">
                          {parcela.valorEstimadoBRL ? "Equivalente hoje: " + formatarMoeda(parcela.valorEstimadoBRL, "BRL") + " (estimativa)" : "BRL calculado ao gerar o Pix."}
                        </div>
                      ) : null}
                      <div className="mt-1">
                        {paga ? (
                          parcela.recibo_url ? (
                            <a href={parcela.recibo_url} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-brand underline">Ver recibo</a>
                          ) : (
                            <span className="cursor-not-allowed text-xs text-neutral-500" title="O recibo ficará disponível em breve">Recibo em breve</span>
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
                      <span className="mt-1 text-xs text-neutral-500">O status será atualizado automaticamente após a confirmação do pagamento.</span>
                      <button
                        onClick={() => cancelarCobranca(parcela.id)}
                        disabled={cancelando === parcela.id}
                        className="mt-1 text-xs font-medium text-neutral-500 underline disabled:opacity-50"
                      >
                        {cancelando === parcela.id ? "Cancelando..." : "Cancelar cobrança e voltar para em aberto"}
                      </button>
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
          {temMoedaEstrangeira ? (
            <p className="mt-4 border-t border-neutral-100 pt-3 text-xs text-neutral-500">
              <span className="font-medium text-brand">VET</span> é a cotação usada na conversão para reais quando o Pix é gerado — já inclui o câmbio comercial do dia, o spread e o IOF. Sua dívida fica registrada em {moedaPrograma}; o valor em reais só é fixado no momento da cobrança.
            </p>
          ) : null}
        </div>
      </main>

      <SuporteRodape contexto="Dúvida sobre uma parcela, o câmbio ou um pagamento? Fale com a gente." />

      {aviso ? (
        <div className="fixed inset-x-0 bottom-24 z-50 flex justify-center px-4">
          <div className="animate-fade-in-up rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-brand-cream shadow-lg">
            {aviso}
          </div>
        </div>
      ) : null}

      {editando && contratoId ? (
        <AjustarParcelas
          parcelas={parcelas}
          contratoId={contratoId}
          dataInicio={dataInicio || null}
          moeda={moedaPrograma}
          valorTotalContrato={valorTotalContrato}
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
