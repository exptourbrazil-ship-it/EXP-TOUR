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
};

function formatarMoeda(valor: number, moeda: string): string {
    try {
          return valor.toLocaleString("pt-BR", { style: "currency", currency: moeda });
    } catch {
          return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    }
}

export default function ParcelasClient({ parcelas }: { parcelas: Parcela[] }) {
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
    { className: "mb-6 flex items-center justify-between" },
        createElement("h1", { className: "text-2xl font-semibold text-brand" }, "Parcelas"),
        createElement("button", { onClick: sair, className: "text-sm text-neutral-500 underline" }, "Sair")
      );

  const erroEl = erro ? createElement("div", { className: "mb-4 text-sm text-red-600" }, erro) : null;

  const itensLista = parcelas.map((parcela) => {
        const moeda = parcela.moeda || "BRL";
        const emMoedaEstrangeira = moeda !== "BRL";
        const cobrancaJaGerada = !!parcela.qr_code_url;

                                      const infoBotaoStatus =
                                              parcela.status === "pago"
            ? createElement("span", { className: "text-sm font-medium text-green-600" }, "Pago")
                                                : parcela.qr_code_url
            ? createElement("span", { className: "text-sm font-medium text-brand" }, "QR Code gerado abaixo")
                                                : createElement(
                                                              "button",
                                                  {
                                                                  onClick: () => gerarCobranca(parcela.id),
                                                                  disabled: gerando === parcela.id,
                                                                  className: "text-sm font-medium text-brand underline disabled:opacity-50",
                                                  },
                                                              gerando === parcela.id ? "Gerando..." : "Gerar Pix"
                                                            );

                                      const linhaTopo = createElement(
                                              "div",
                                        { className: "flex items-center justify-between" },
                                              createElement(
                                                        "div",
                                                        null,
                                                        createElement("div", { className: "font-medium" }, parcela.descricao),
                                                        createElement(
                                                                    "div",
                                                          { className: "text-sm text-neutral-500" },
                                                                    `Vencimento: ${new Date(parcela.vencimento).toLocaleDateString("pt-BR")}`
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
                                                                          `Voce paga: ${formatarMoeda(Number(parcela.valor_atual), "BRL")} (cotacao VET: ${
                                                                                            parcela.cotacao_aplicada ?? "-"
                                                                          })`
                                                                        )
                                                          : null,
                                                        emMoedaEstrangeira && !cobrancaJaGerada && parcela.status !== "pago"
                                                          ? createElement(
                                                                          "div",
                                                            { className: "text-xs text-neutral-400" },
                                                                          "O valor em BRL sera calculado no momento de gerar o Pix, pela cotacao do dia."
                                                                        )
                                                          : null,
                                                        infoBotaoStatus
                                                      )
                                            );

                                      const blocoQr =
                                              parcela.status !== "pago" && parcela.qr_code_url
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

                                      return createElement(
                                              "div",
                                        { key: parcela.id, className: "rounded-lg border border-neutral-200 bg-white p-4 shadow-sm" },
                                              linhaTopo,
                                              blocoQr
                                            );
  });

  const listaEl = createElement("div", { className: "space-y-3" }, ...itensLista);

  return createElement("main", { className: "mx-auto max-w-3xl p-6" }, cabecalho, erroEl, listaEl);
}
