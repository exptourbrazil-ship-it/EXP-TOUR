"use client";

import { createElement as h, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

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
  contrato?: { moeda: string } | null;
};

function formatarMoeda(valor: number, moeda: string) {
  try {
    return valor.toLocaleString("pt-BR", { style: "currency", currency: moeda });
  } catch {
    return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }
}

// TODO: substituir por titular_id vindo da sessao autenticada (CPF + codigo WhatsApp).
// Por enquanto aceita ?titular=ID na URL apenas para desenvolvimento.
export default function ParcelasPage() {
  const [parcelas, setParcelas] = useState([] as Parcela[]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null as string | null);
  const [gerando, setGerando] = useState(null as string | null);

  async function carregar() {
    const params = new URLSearchParams(window.location.search);
    const titularId = params.get("titular");

    if (!titularId) {
      setErro("Sessao nao identificada. Faca login novamente.");
      setLoading(false);
      return;
    }

    const { data: contratos, error: contratosError } = await supabase
      .from("contratos")
      .select("id")
      .eq("titular_id", titularId);

    if (contratosError || !contratos || contratos.length === 0) {
      setErro("Nao foi possivel carregar seus contratos.");
      setLoading(false);
      return;
    }

    const contratoIds = contratos.map((c) => c.id);

    const { data, error } = await supabase
      .from("parcelas")
      .select("*, contrato:contratos(moeda)")
      .in("contrato_id", contratoIds)
      .order("numero", { ascending: true });

    if (error) {
      setErro("Nao foi possivel carregar as parcelas.");
    } else {
      setParcelas(data as unknown as Parcela[]);
    }
    setLoading(false);
  }

  useEffect(() => {
    carregar();
  }, []);

  async function gerarCobranca(parcelaId: string) {
    setGerando(parcelaId);
    try {
      const response = await fetch(`/api/parcelas/${parcelaId}/gerar-cobranca`, {
        method: "POST",
      });
      const resultado = await response.json();
      if (resultado.ok) {
        await carregar();
      } else {
        setErro(resultado.erro || "Nao foi possivel gerar a cobranca Pix.");
      }
    } catch {
      setErro("Nao foi possivel gerar a cobranca Pix.");
    } finally {
      setGerando(null);
    }
  }

  if (loading) {
    return h("div", { className: "p-6 text-sm text-neutral-600" }, "Carregando parcelas...");
  }

  if (erro) {
    return h("div", { className: "p-6 text-sm text-red-600" }, erro);
  }

  return h(
    "main",
    { className: "mx-auto max-w-3xl p-6" },
    h("h1", { className: "mb-6 text-2xl font-semibold text-brand" }, "Parcelas"),
    h(
      "div",
      { className: "space-y-3" },
      parcelas.map((parcela) => {
        const moeda = parcela.contrato?.moeda || "BRL";
        const emMoedaEstrangeira = moeda !== "BRL";
        const cobrancaJaGerada = !!parcela.qr_code_url;

        return h(
          "div",
          {
            key: parcela.id,
            className: "rounded-lg border border-neutral-200 bg-white p-4 shadow-sm",
          },
          h(
            "div",
            { className: "flex items-center justify-between" },
            h(
              "div",
              null,
              h("div", { className: "font-medium" }, parcela.descricao),
              h(
                "div",
                { className: "text-sm text-neutral-500" },
                "Vencimento: " + new Date(parcela.vencimento).toLocaleDateString("pt-BR")
              )
            ),
            h(
              "div",
              { className: "text-right" },
              h(
                "div",
                { className: "font-semibold" },
                formatarMoeda(Number(parcela.valor_original), moeda)
              ),
              emMoedaEstrangeira && cobrancaJaGerada
                ? h(
                    "div",
                    { className: "text-xs text-neutral-500" },
                    `Você paga: ${formatarMoeda(Number(parcela.valor_atual), "BRL")} (cotação VET: ${parcela.cotacao_aplicada})`
                  )
                : null,
              emMoedaEstrangeira && !cobrancaJaGerada && parcela.status !== "pago"
                ? h(
                    "div",
                    { className: "text-xs text-neutral-400" },
                    "O valor em BRL sera calculado no momento de gerar o Pix, pela cotacao do dia."
                  )
                : null,
              parcela.status === "pago"
                ? h("span", { className: "text-sm font-medium text-green-600" }, "Pago")
                : parcela.qr_code_url
                ? h("span", { className: "text-sm font-medium text-brand" }, "QR Code gerado abaixo")
                : h(
                    "button",
                    {
                      onClick: () => gerarCobranca(parcela.id),
                      disabled: gerando === parcela.id,
                      className: "text-sm font-medium text-brand underline disabled:opacity-50",
                    },
                    gerando === parcela.id ? "Gerando..." : "Gerar Pix"
                  )
            )
          ),
          parcela.status !== "pago" && parcela.qr_code_url
            ? h(
                "div",
                {
                  className:
                    "mt-4 flex flex-col items-center gap-2 border-t border-neutral-100 pt-4",
                },
                h("img", {
                  src: parcela.qr_code_url,
                  alt: "QR Code Pix",
                  className: "h-40 w-40",
                }),
                parcela.payment_link
                  ? h(
                      "button",
                      {
                        onClick: () =>
                          navigator.clipboard.writeText(parcela.payment_link as string),
                        className: "text-xs text-neutral-500 underline",
                      },
                      "Copiar codigo Pix (copia e cola)"
                    )
                  : null,
                h(
                  "span",
                  { className: "text-xs text-neutral-400" },
                  "O status sera atualizado automaticamente apos a confirmacao do pagamento."
                )
              )
            : null
        );
      })
    )
  );
}
