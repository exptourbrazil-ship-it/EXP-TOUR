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
export default function ParcelasClient({ parcelas, programaNome, totalPrograma, pagoAteAgora }: { parcelas: Parcela[]; programaNome?: string | null; totalPrograma?: number; pagoAteAgora?: number }) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [gerando, setGerando] = useState<string | null>(null);

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
  const moedaPrograma = parcelas.length > 0 ? parcelas[0].moeda : "BRL";

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
            parcela.payment_link
              ? createElement(
                  "button",
                  {
                    onClick: () => navigator.clipboard.writeText(parcela.payment_link as string),
                    className: "text-xs text-neutral-500 underline",
                  },
                  "Copiar codigo Pix (copia e cola)"
                )
              : null,
            createElement(
              "span",
              { className: "text-xs text-neutral-400" },
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

  const listaEl = createElement(
    "div",
    { className: "space-y-3" },
    createElement("h2", { className: "mb-1 text-lg font-semibold text-brand" }, "Parcelas"),
    ...itensLista
  );

  return createElement("main", { className: "mx-auto max-w-3xl p-6" }, cabecalho, resumoPagamento, erroEl, listaEl);
}
