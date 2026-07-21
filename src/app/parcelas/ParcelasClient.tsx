"use client";

import { useState, createElement } from "react";
import { useRouter } from "next/navigation";

type Parcela = {
  id: string;
  numero: number;
  descricao: string;
  valor_original: number;
  valor_atual: number;
  cotacao_aplicada: number | null;
  vencimento: string;
  status: "pendente" | "pago" | "atrasado";
  is_entrada: boolean;
  payment_link: string | null;
  qr_code_url: string | null;
  moeda: string;
  cotacaoEstimada?: number | null;
  valorEstimadoBRL?: number | null;
};

type LinhaEdicao = {
  id?: string;
  descricao: string;
  valor: string;
  vencimento: string;
  bloqueada: boolean;
};

function formatarMoeda(valor: number, moeda: string): string {
  try {
    return valor.toLocaleString("pt-BR", { style: "currency", currency: moeda });
  } catch {
    return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }
}

function IconePago() {
  return createElement(
    "span",
    { className: "flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-600 text-xs text-white" },
    "\u2713"
  );
}

function IconePendente() {
  return createElement("span", { className: "h-6 w-6 shrink-0 rounded-full border-2 border-neutral-300" });
}

function CopiarPix({ codigo }: { codigo: string }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    let ok = false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(codigo);
        ok = true;
      }
    } catch {
      ok = false;
    }
    if (!ok) {
      try {
        const ta = document.createElement("textarea");
        ta.value = codigo;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        ok = true;
      } catch {
        ok = false;
      }
    }
    if (ok) {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    }
  }

  return createElement(
    "div",
    { className: "mt-3 w-full max-w-md" },
    createElement("p", { className: "mb-1 text-xs text-neutral-500" }, "Pix copia e cola"),
    createElement(
      "div",
      { className: "flex items-stretch gap-2" },
      createElement("textarea", {
        readOnly: true,
        value: codigo,
        onClick: (e: any) => e.target.select(),
        className: "h-16 flex-1 resize-none rounded-lg border border-neutral-200 bg-neutral-50 p-2 text-[11px] leading-tight text-neutral-600 break-all",
      }),
      createElement(
        "button",
        {
          onClick: copiar,
          className: copiado
            ? "shrink-0 rounded-lg bg-green-600 px-4 text-sm font-medium text-white"
            : "shrink-0 rounded-lg bg-brand px-4 text-sm font-medium text-white",
        },
        copiado ? "Copiado!" : "Copiar"
      )
    )
  );
}

function AjustarParcelas({ parcelas, contratoId, dataInicio, moeda, onFechar, onSalvo }: { parcelas: Parcela[]; contratoId: string; dataInicio: string | null; moeda: string; onFechar: () => void; onSalvo: () => void; }) {
  const iniciais: LinhaEdicao[] = parcelas.map((p) => ({
    id: p.id,
    descricao: p.descricao,
    valor: String(p.valor_original),
    vencimento: p.vencimento ? p.vencimento.slice(0, 10) : "",
    bloqueada: p.status === "pago" || !!p.qr_code_url,
  }));

  const [linhas, setLinhas] = useState<LinhaEdicao[]>(iniciais);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const limite30 = (() => {
    if (!dataInicio) return null;
    const inicio = new Date(dataInicio + "T00:00:00");
    const limite = new Date(inicio);
    limite.setDate(limite.getDate() - 30);
    return limite;
  })();

  function atualizar(index: number, campo: keyof LinhaEdicao, valor: string) {
    setLinhas((atual) => atual.map((l, i) => (i === index ? { ...l, [campo]: valor } : l)));
  }

  function remover(index: number) {
    setLinhas((atual) => atual.filter((_, i) => i !== index));
  }

  function adicionar() {
    setLinhas((atual) => [...atual, { descricao: "Nova parcela", valor: "", vencimento: "", bloqueada: false }]);
  }

  const total = linhas.reduce((soma, l) => soma + (Number(l.valor) || 0), 0);

  async function salvar() {
    setErro(null);
    for (const l of linhas) {
      if (!l.descricao || !l.vencimento || !(Number(l.valor) > 0)) {
        setErro("Cada parcela precisa de descricao, valor maior que zero e data de vencimento.");
        return;
      }
    }
    if (limite30) {
      const ultimo = linhas
        .map((l) => new Date(l.vencimento + "T00:00:00"))
        .reduce((max, d) => (d > max ? d : max), new Date(0));
      if (ultimo > limite30) {
        setErro("O ultimo pagamento precisa ser ate " + limite30.toISOString().slice(0, 10) + " (30 dias antes do inicio do programa).");
        return;
      }
    }
    setSalvando(true);
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
      };
      const resp = await fetch("/api/parcelas/ajustar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const resultado = await resp.json();
      if (resultado.ok) {
        onSalvo();
      } else {
        setErro(resultado.erro || "Nao foi possivel salvar as alteracoes.");
      }
    } catch {
      setErro("Nao foi possivel salvar as alteracoes.");
    } finally {
      setSalvando(false);
    }
  }

  const linhasEl = linhas.map((l, index) =>
    createElement(
      "div",
      { key: l.id || "nova-" + index, className: "rounded-xl border border-neutral-200 p-3" },
      l.bloqueada
        ? createElement("p", { className: "mb-2 text-xs font-medium text-neutral-400" }, "Parcela ja paga ou com Pix gerado - nao pode ser alterada")
        : null,
      createElement(
        "div",
        { className: "flex flex-col gap-2 sm:flex-row sm:items-end" },
        createElement(
          "label",
          { className: "flex-1 text-xs text-neutral-500" },
          "Descricao",
          createElement("input", {
            type: "text",
            value: l.descricao,
            disabled: l.bloqueada,
            onChange: (e: any) => atualizar(index, "descricao", e.target.value),
            className: "mt-1 w-full rounded-lg border border-neutral-200 p-2 text-sm disabled:bg-neutral-100",
          })
        ),
        createElement(
          "label",
          { className: "w-28 text-xs text-neutral-500" },
          "Valor (" + moeda + ")",
          createElement("input", {
            type: "number",
            step: "0.01",
            min: "0",
            value: l.valor,
            disabled: l.bloqueada,
            onChange: (e: any) => atualizar(index, "valor", e.target.value),
            className: "mt-1 w-full rounded-lg border border-neutral-200 p-2 text-sm disabled:bg-neutral-100",
          })
        ),
        createElement(
          "label",
          { className: "w-40 text-xs text-neutral-500" },
          "Vencimento",
          createElement("input", {
            type: "date",
            value: l.vencimento,
            disabled: l.bloqueada,
            onChange: (e: any) => atualizar(index, "vencimento", e.target.value),
            className: "mt-1 w-full rounded-lg border border-neutral-200 p-2 text-sm disabled:bg-neutral-100",
          })
        ),
        l.bloqueada
          ? null
          : createElement(
              "button",
              { onClick: () => remover(index), className: "shrink-0 rounded-lg border border-red-200 px-3 py-2 text-sm text-red-600" },
              "Excluir"
            )
      )
    )
  );

  return createElement(
    "div",
    { className: "fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" },
    createElement(
      "div",
      { className: "max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl" },
      createElement(
        "div",
        { className: "mb-4 flex items-center justify-between" },
        createElement("h3", { className: "text-lg font-semibold text-brand" }, "Ajustar parcelas"),
        createElement("button", { onClick: onFechar, className: "text-sm text-neutral-500 underline" }, "Fechar")
      ),
      dataInicio
        ? createElement(
            "p",
            { className: "mb-3 text-xs text-neutral-500" },
            "O ultimo pagamento precisa ser ate 30 dias antes do inicio do programa (" + new Date(dataInicio + "T00:00:00").toLocaleDateString("pt-BR") + ")."
          )
        : createElement(
            "p",
            { className: "mb-3 text-xs text-neutral-400" },
            "Voce pode ajustar valores e datas, adicionar ou excluir parcelas."
          ),
      createElement("div", { className: "space-y-3" }, ...linhasEl),
      createElement(
        "button",
        { onClick: adicionar, className: "mt-3 rounded-lg border border-dashed border-neutral-300 px-4 py-2 text-sm text-neutral-600" },
        "+ Adicionar parcela"
      ),
      erro ? createElement("div", { className: "mt-3 text-sm text-red-600" }, erro) : null,
      createElement(
        "div",
        { className: "mt-4 flex items-center justify-between border-t border-neutral-100 pt-4" },
        createElement("span", { className: "text-sm text-neutral-500" }, "Total: " + formatarMoeda(total, moeda)),
        createElement(
          "div",
          { className: "flex gap-2" },
          createElement("button", { onClick: onFechar, className: "rounded-full border border-neutral-300 px-4 py-2 text-sm" }, "Cancelar"),
          createElement(
            "button",
            { onClick: salvar, disabled: salvando, className: "rounded-full bg-brand px-5 py-2 text-sm font-medium text-white disabled:opacity-50" },
            salvando ? "Salvando..." : "Salvar"
          )
        )
      )
    )
  );
}

export default function ParcelasClient({ parcelas, programaNome, totalPrograma, pagoAteAgora, contratoId, dataInicio }: { parcelas: Parcela[]; programaNome?: string | null; totalPrograma?: number; pagoAteAgora?: number; contratoId?: string | null; dataInicio?: string | null }) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [gerando, setGerando] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);

  async function gerarCobranca(parcelaId: string) {
    setGerando(parcelaId);
    setErro(null);
    try {
      const response = await fetch(`/api/parcelas/${parcelaId}/gerar-cobranca`, { method: "POST" });
      const resultado = await response.json();
      if (resultado.ok) {
        router.refresh();
      } else {
        setErro(resultado.erro || "Nao foi possivel gerar a cobranca Pix.");
      }
    } catch {
      setErro("Nao foi possivel gerar a cobranca Pix.");
    } finally {
      setGerando(null);
    }
  }

  async function sair() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/";
  }

  const moedaPrograma = parcelas.length > 0 ? parcelas[0].moeda : "BRL";

  const cabecalho = createElement(
    "div",
    { className: "mb-6" },
    createElement(
      "div",
      { className: "flex items-center justify-between" },
      createElement("h1", { className: "text-3xl font-semibold text-brand" }, "Financeiro"),
      createElement("button", { onClick: sair, className: "text-sm text-neutral-500 underline" }, "Sair")
    ),
    programaNome ? createElement("p", { className: "mt-1 text-sm text-neutral-500" }, programaNome) : null
  );

  const percentualPago = totalPrograma && totalPrograma > 0 ? Math.min(100, Math.round(((pagoAteAgora || 0) / totalPrograma) * 100)) : 0;

  const resumoPagamento =
    totalPrograma && totalPrograma > 0
      ? createElement(
          "div",
          { className: "mb-6 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm" },
          createElement("p", { className: "text-xs font-medium uppercase tracking-wide text-neutral-500" }, "Pago at\u00e9 agora"),
          createElement(
            "div",
            { className: "mt-1 flex items-baseline gap-2" },
            createElement("span", { className: "text-3xl font-semibold text-green-700" }, formatarMoeda(pagoAteAgora || 0, moedaPrograma)),
            createElement("span", { className: "text-sm text-neutral-500" }, `${percentualPago}% do programa`)
          ),
          createElement(
            "div",
            { className: "mt-3 h-2 w-full rounded-full bg-neutral-100" },
            createElement("div", { className: "h-2 rounded-full bg-green-600 transition-all", style: { width: `${percentualPago}%` } })
          )
        )
      : null;

  const erroEl = erro ? createElement("div", { className: "mb-4 text-sm text-red-600" }, erro) : null;

  const proximaParcela = parcelas.find((p) => p.status !== "pago");
  const itensLista = parcelas.map((parcela) => {
    const moeda = parcela.moeda || "BRL";
    const emMoedaEstrangeira = moeda !== "BRL";
    const cobrancaJaGerada = !!parcela.qr_code_url;
    const paga = parcela.status === "pago";
    const ehProxima = !paga && proximaParcela?.id === parcela.id;

    const infoBotaoStatus = paga
      ? createElement("span", { className: "text-sm font-medium text-green-600" }, "Pago")
      : parcela.qr_code_url
      ? createElement("span", { className: "text-sm font-medium text-brand" }, "QR Code gerado abaixo")
      : createElement(
          "button",
          {
            onClick: () => gerarCobranca(parcela.id),
            disabled: gerando === parcela.id,
            className: ehProxima
              ? "rounded-full bg-brand px-4 py-2 text-sm font-medium text-white shadow-sm disabled:opacity-50"
              : "text-sm font-medium text-brand underline disabled:opacity-50",
          },
          gerando === parcela.id ? "Gerando..." : "Gerar Pix"
        );

    const linhaTopo = createElement(
      "div",
      { className: "flex items-center justify-between gap-3" },
      createElement(
        "div",
        { className: "flex items-center gap-3" },
        paga ? createElement(IconePago, null) : createElement(IconePendente, null),
        createElement(
          "div",
          null,
          createElement("div", { className: "font-medium" }, parcela.descricao),
          createElement(
            "div",
            { className: "text-sm text-neutral-500" },
            `Vencimento: ${new Date(parcela.vencimento).toLocaleDateString("pt-BR")}`
          )
        )
      ),
      createElement(
        "div",
        { className: "text-right" },
        createElement("div", { className: "font-semibold" }, formatarMoeda(Number(parcela.valor_original), moeda)),
        emMoedaEstrangeira && cobrancaJaGerada
          ? createElement(
              "div",
              { className: "text-xs text-neutral-500" },
              `Voce paga: ${formatarMoeda(Number(parcela.valor_atual), "BRL")} (cotacao VET: ${parcela.cotacao_aplicada ?? "-"})`
            )
          : null,
        emMoedaEstrangeira && !cobrancaJaGerada && !paga
          ? createElement(
              "div",
              { className: "text-xs text-neutral-400" },
              parcela.valorEstimadoBRL
                ? `Equivalente hoje: ${formatarMoeda(parcela.valorEstimadoBRL, "BRL")} (estimativa, a cotacao pode mudar ate o pagamento)`
                : "O valor em BRL sera calculado no momento de gerar o Pix, pela cotacao do dia."
            )
          : null,
        createElement("div", { className: "mt-1" }, infoBotaoStatus)
      )
    );

    const blocoQr =
      !paga && parcela.qr_code_url
        ? createElement(
            "div",
            { className: "mt-4 flex flex-col items-center gap-2 border-t border-neutral-100 pt-4" },
            createElement("img", { src: parcela.qr_code_url, alt: "QR Code Pix", className: "h-40 w-40" }),
            parcela.payment_link ? createElement(CopiarPix, { codigo: parcela.payment_link }) : null,
            createElement(
              "span",
              { className: "mt-1 text-xs text-neutral-400" },
              "O status sera atualizado automaticamente apos a confirmacao do pagamento."
            )
          )
        : null;

    const rotuloProxima = ehProxima
      ? createElement(
          "p",
          { className: "mb-2 text-xs font-semibold uppercase tracking-wide text-amber-700" },
          `Pr\u00f3xima \u00b7 ${new Date(parcela.vencimento).toLocaleDateString("pt-BR")}`
        )
      : null;

    return createElement(
      "div",
      {
        key: parcela.id,
        className: ehProxima
          ? "rounded-2xl border border-amber-200 bg-amber-50 p-4"
          : "rounded-2xl border border-neutral-200 bg-white p-4",
      },
      rotuloProxima,
      linhaTopo,
      blocoQr
    );
  });

  const cabecalhoLista = createElement(
    "div",
    { className: "mb-1 flex items-center justify-between" },
    createElement("h2", { className: "text-lg font-semibold text-brand" }, "Parcelas"),
    contratoId
      ? createElement(
          "button",
          { onClick: () => setEditando(true), className: "text-sm font-medium text-brand underline" },
          "Ajustar parcelas"
        )
      : null
  );

  const listaEl = createElement("div", { className: "space-y-3" }, cabecalhoLista, ...itensLista);

  const modal =
    editando && contratoId
      ? createElement(AjustarParcelas, {
          parcelas,
          contratoId,
          dataInicio: dataInicio || null,
          moeda: moedaPrograma,
          onFechar: () => setEditando(false),
          onSalvo: () => {
            setEditando(false);
            router.refresh();
          },
        })
      : null;

  return createElement("main", { className: "mx-auto max-w-3xl p-6 pb-28" }, cabecalho, resumoPagamento, erroEl, listaEl, modal);
}
