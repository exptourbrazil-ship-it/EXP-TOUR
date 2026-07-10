"use client";

import { useState, createElement, Fragment } from "react";

type Etapa = "cpf" | "codigo";

export default function LoginPage() {
    const [etapa, setEtapa] = useState<Etapa>("cpf");
    const [cpf, setCpf] = useState("");
    const [codigo, setCodigo] = useState("");
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<string | null>(null);

  async function handleSolicitarCodigo(e: any) {
        e.preventDefault();
        setLoading(true);
        setMessage(null);
        try {
                const res = await fetch("/api/auth/request-code", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ cpf }),
                });
                if (!res.ok) throw new Error("Falha ao solicitar codigo");
                setEtapa("codigo");
                setMessage("Codigo enviado para o seu WhatsApp.");
        } catch (err) {
                setMessage("Nao foi possivel enviar o codigo. Verifique o CPF informado.");
        } finally {
                setLoading(false);
        }
  }

  async function handleConfirmarCodigo(e: any) {
        e.preventDefault();
        setLoading(true);
        setMessage(null);
        try {
                const res = await fetch("/api/auth/verify-code", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ cpf, codigo }),
                });
                const resultado = await res.json();
                if (!res.ok || !resultado.success) {
                          setMessage(resultado.error || "Codigo invalido ou expirado.");
                          return;
                }
                window.location.href = "/parcelas";
        } catch (err) {
                setMessage("Nao foi possivel confirmar o codigo.");
        } finally {
                setLoading(false);
        }
  }

  const tituloEl = createElement("h1", { className: "mb-2 text-2xl font-semibold text-brand" }, "Area do cliente");

  const formularioCpf = createElement(
        "form",
    { onSubmit: handleSolicitarCodigo, className: "space-y-4" },
        createElement(
                "div",
                null,
                createElement("label", { className: "mb-1 block text-sm font-medium" }, "CPF"),
                createElement("input", {
                          type: "text",
                          required: true,
                          value: cpf,
                          onChange: (e: any) => setCpf(e.target.value),
                          placeholder: "000.000.000-00",
                          className: "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-brand focus:outline-none",
                })
              ),
        createElement(
                "div",
                null,
                createElement(
                          "button",
                  {
                              type: "submit",
                              disabled: loading,
                              className: "w-full rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50",
                  },
                          loading ? "Enviando..." : "Receber codigo no WhatsApp"
                        )
              )
      );

  const formularioCodigo = createElement(
        "form",
    { onSubmit: handleConfirmarCodigo, className: "space-y-4" },
        createElement(
                "div",
                null,
                createElement("label", { className: "mb-1 block text-sm font-medium" }, "Codigo de acesso"),
                createElement("input", {
                          type: "text",
                          required: true,
                          value: codigo,
                          onChange: (e: any) => setCodigo(e.target.value),
                          placeholder: "000000",
                          maxLength: 6,
                          className: "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-brand focus:outline-none",
                })
              ),
        createElement(
                "div",
                null,
                createElement(
                          "button",
                  {
                              type: "submit",
                              disabled: loading,
                              className: "w-full rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50",
                  },
                          loading ? "Confirmando..." : "Confirmar codigo"
                        )
              ),
        createElement(
                "button",
          {
                    type: "button",
                    onClick: () => {
                                setEtapa("cpf");
                                setMessage(null);
                    },
                    className: "w-full text-center text-sm text-neutral-500 underline",
          },
                "Usar outro CPF"
              )
      );

  const conteudoEtapa =
        etapa === "cpf"
        ? createElement(
                    Fragment,
                    null,
                    createElement(
                                  "p",
                      { className: "mb-6 text-sm text-neutral-600" },
                                  "Informe seu CPF. Enviaremos um codigo de acesso no seu WhatsApp - voce vera apenas os seus contratos"
                                ),
                    formularioCpf
                  )
          : createElement(
                      Fragment,
                      null,
                      createElement(
                                    "p",
                        { className: "mb-6 text-sm text-neutral-600" },
                                    "Digite o codigo de 6 digitos que enviamos no seu WhatsApp."
                                  ),
                      formularioCodigo
                    );

  const mensagemEl = message ? createElement("p", { className: "mt-4 text-sm text-neutral-700" }, message) : null;

  return createElement(
        "main",
    { className: "flex min-h-screen items-center justify-center p-6" },
        createElement(
                "div",
          { className: "w-full max-w-md rounded-xl border border-neutral-200 bg-white p-8 shadow-sm" },
                tituloEl,
                conteudoEtapa,
                mensagemEl
              )
      );
}
