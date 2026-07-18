"use client";

import { useState, createElement, Fragment } from "react";

type Etapa = "cpf" | "codigo";

const LOGO_URL = "https://exp-tour.com/wp-content/uploads/2026/04/EXP-Tour-Original-Logo.svg";

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
                    setMessage("Codigo enviado para o seu email.");
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

  const logoEl = createElement("img", {
          src: LOGO_URL,
          alt: "EXP TOUR",
          width: 175,
          className: "mx-auto mb-6",
  });

  const tituloEl = createElement("h1", { className: "mb-2 text-3xl font-semibold text-brand" }, "Area do cliente");

  const formularioCpf = createElement(
          "form",
      { onSubmit: handleSolicitarCodigo, className: "space-y-4" },
          createElement(
                    "div",
                    null,
                    createElement("label", { className: "mb-1 block text-base font-medium text-brand" }, "CPF"),
                    createElement("input", {
                                type: "text",
                                required: true,
                                value: cpf,
                                onChange: (e: any) => setCpf(e.target.value),
                                placeholder: "000.000.000-00",
                                className: "w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-base focus:border-brand focus:outline-none",
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
                                      className: "w-full rounded-md bg-brand px-4 py-2 text-base font-medium text-white hover:opacity-90 disabled:opacity-50",
                        },
                                loading ? "Enviando..." : "Receber codigo por email"
                              )
                  )
        );

  const formularioCodigo = createElement(
          "form",
      { onSubmit: handleConfirmarCodigo, className: "space-y-4" },
          createElement(
                    "div",
                    null,
                    createElement("label", { className: "mb-1 block text-base font-medium text-brand" }, "Codigo de acesso"),
                    createElement("input", {
                                type: "text",
                                required: true,
                                value: codigo,
                                onChange: (e: any) => setCodigo(e.target.value),
                                placeholder: "000000",
                                maxLength: 6,
                                className: "w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-base focus:border-brand focus:outline-none",
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
                                      className: "w-full rounded-md bg-brand px-4 py-2 text-base font-medium text-white hover:opacity-90 disabled:opacity-50",
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
                          className: "w-full text-center text-base text-brand underline",
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
                            { className: "mb-6 text-base text-brand" },
                                        "Informe seu CPF. Enviaremos um codigo de acesso para o seu email - voce vera apenas os seus contratos"
                                      ),
                        formularioCpf
                      )
            : createElement(
                          Fragment,
                          null,
                          createElement(
                                          "p",
                              { className: "mb-6 text-base text-brand" },
                                          "Digite o codigo de 6 digitos que enviamos para o seu email."
                                        ),
                          formularioCodigo
                        );

  const mensagemEl = message ? createElement("p", { className: "mt-4 text-base text-brand" }, message) : null;

  return createElement(
          "main",
      { className: "flex min-h-screen flex-col items-center justify-center p-6" },
          logoEl,
          createElement(
                    "div",
              { className: "w-full max-w-md rounded-xl bg-brand-cream p-8 shadow-lg" },
                    tituloEl,
                    conteudoEtapa,
                    mensagemEl
                  )
        );
}
