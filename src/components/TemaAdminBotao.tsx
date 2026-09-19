"use client";

import { useEffect, useState } from "react";

// Alterna o tema do ADMIN entre claro e escuro. A escolha fica guardada no
// navegador do operador (por maquina, nao por conta) e vence a preferencia do
// sistema; sem escolha, segue o sistema.
//
// Quem aplica o tema na primeira pintura e o script inline do layout — aqui so
// trocamos o atributo e guardamos a escolha, para nao piscar na carga.
const CHAVE = "forio-admin-tema";

function preferenciaDoSistema(): "claro" | "escuro" {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "escuro" : "claro";
  } catch {
    return "claro";
  }
}

export default function TemaAdminBotao() {
  const [tema, setTema] = useState<"claro" | "escuro">("claro");

  useEffect(() => {
    const atual = document.documentElement.getAttribute("data-tema");
    setTema(atual === "escuro" ? "escuro" : "claro");
  }, []);

  function alternar() {
    const novo = tema === "escuro" ? "claro" : "escuro";
    setTema(novo);
    document.documentElement.setAttribute("data-tema", novo);
    try {
      // Guardar "sistema" quando a escolha coincide com a do sistema deixa o
      // operador voltar a seguir o computador dele sem uma terceira opcao.
      if (novo === preferenciaDoSistema()) localStorage.removeItem(CHAVE);
      else localStorage.setItem(CHAVE, novo);
    } catch {
      // Navegador sem storage (janela privada): o tema vale ate recarregar.
    }
  }

  const escuro = tema === "escuro";
  return (
    <button
      type="button"
      onClick={alternar}
      aria-pressed={escuro}
      title={escuro ? "Mudar para o tema claro" : "Mudar para o tema escuro"}
      aria-label={escuro ? "Mudar para o tema claro" : "Mudar para o tema escuro"}
      className="flex h-9 w-9 items-center justify-center rounded-full text-brand-cream ring-1 ring-brand-cream/25"
    >
      <span aria-hidden="true" className="text-base leading-none">{escuro ? "☀" : "☾"}</span>
    </button>
  );
}
