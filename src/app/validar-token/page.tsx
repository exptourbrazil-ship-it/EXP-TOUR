"use client";

import { Suspense, useEffect, useState, createElement } from "react";
import { useSearchParams } from "next/navigation";

type ResultadoValidacao = {
  status: string;
  mensagem: string;
  cpf?: string;
  email?: string;
};

const ZOHO_API_URL = "https://www.zohoapis.com/creator/custom/exptourltda/Validar_Token_Acesso";
const ZOHO_PUBLIC_KEY = "a1ArgxHAmygdP3Yu8r1HvRaVf";

export default function ValidarTokenPage() {
  return createElement(Suspense, { fallback: createElement(Carregando) }, createElement(ValidarTokenContent));
}

function Carregando() {
  return createElement(
    "main",
    { className: "min-h-screen bg-neutral-50 flex items-center justify-center px-4 py-10" },
    createElement("p", { className: "text-neutral-600 text-sm" }, "Carregando...")
    );
}

function ValidarTokenContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [resultado, setResultado] = useState(null as ResultadoValidacao | null);
  const [carregando, setCarregando] = useState(true);

useEffect(() => {
  async function validar() {
    if (!token) {
      setResultado({ status: "invalido", mensagem: "Nenhum token foi informado no link." });
      setCarregando(false);
      return;
    }
    try {
      const url = ZOHO_API_URL + "?publickey=" + ZOHO_PUBLIC_KEY + "&token=" + encodeURIComponent(token);
      const res = await fetch(url);
      const data = await res.json();
      const info = data && data.result;
      if (!info || !info.status) {
        setResultado({ status: "erro", mensagem: "Nao foi possivel validar o token agora. Tente novamente em alguns minutos." });
      } else {
        setResultado(info);
      }
    } catch (err) {
      setResultado({ status: "erro", mensagem: "Nao foi possivel conectar ao servidor de validacao." });
    } finally {
      setCarregando(false);
    }
  }
  validar();
}, [token]);

const cabecalho = createElement(
  "div",
  { className: "bg-brand px-6 py-5 text-center" },
  createElement("p", { className: "text-gold text-xs font-semibold tracking-widest uppercase mb-1" }, "EXP TOUR"),
  createElement("h1", { className: "text-white text-lg font-semibold" }, "Validacao de Acesso")
  );

const corpo = carregando
  ? createElement("p", { className: "text-center text-neutral-600 text-sm" }, "Validando seu link de acesso...")
  : resultado
  ? createElement(ResultadoView, { resultado: resultado })
  : null;

return createElement(
  "main",
  { className: "min-h-screen bg-neutral-50 flex items-center justify-center px-4 py-10" },
  createElement(
    "div",
    { className: "w-full max-w-md rounded-lg overflow-hidden shadow-lg border border-neutral-200" },
    cabecalho,
    createElement("div", { className: "bg-white px-6 py-8" }, corpo)
    )
  );
}

function ResultadoView(props: { resultado: ResultadoValidacao }) {
  const resultado = props.resultado;
  const configPorStatus: { [key: string]: { titulo: string; cor: string; icone: string } } = {
    valido: { titulo: "Acesso autorizado", cor: "text-brand", icone: "OK" },
    expirado: { titulo: "Link expirado", cor: "text-amber-600", icone: "!" },
    usado: { titulo: "Link ja utilizado", cor: "text-amber-600", icone: "!" },
    invalido: { titulo: "Link invalido", cor: "text-red-600", icone: "X" },
    erro: { titulo: "Erro ao validar", cor: "text-red-600", icone: "X" },
  };

const info = configPorStatus[resultado.status] || configPorStatus.erro;

const caixaSucesso = resultado.status === "valido"
  ? createElement(
    "div",
    { className: "rounded-md px-4 py-3 mb-4 text-sm text-left", style: { backgroundColor: "#F5EAD9" } },
    createElement(
      "p",
      { className: "text-neutral-800" },
      "Ola" + (resultado.email ? ", " + resultado.email : "") + "! Seu acesso foi confirmado com sucesso."
      )
    )
  : null;

const botao = resultado.status === "valido"
  ? createElement(
    "a",
    { href: "/", className: "inline-block w-full rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition" },
    "Acessar a Area do Cliente"
    )
  : createElement(
    "a",
    { href: "/", className: "inline-block w-full rounded-md border border-brand px-4 py-2 text-sm font-medium text-brand hover:bg-neutral-50 transition" },
    "Ir para a pagina inicial"
    );

return createElement(
  "div",
  { className: "text-center" },
  createElement("div", { className: "text-2xl font-bold mb-3 " + info.cor }, info.icone),
  createElement("h2", { className: "text-lg font-semibold mb-2 " + info.cor }, info.titulo),
  caixaSucesso,
  createElement("p", { className: "text-neutral-600 text-sm mb-6" }, resultado.mensagem),
  botao
  );
}
