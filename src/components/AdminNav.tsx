"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { ADMIN_NAV } from "@/lib/admin-nav";

// Menu de navegacao do painel admin. Em telas grandes vira uma barra lateral
// fixa; no celular/tablet vira uma faixa horizontal rolavel no topo do
// conteudo. Destaca a aba ativa (aria-current) e traz o botao "Sair".
export default function AdminNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [saindo, setSaindo] = useState(false);

  async function sair() {
    setSaindo(true);
    try {
      await fetch("/api/admin/logout", { method: "POST" });
    } catch {
      // segue para o login mesmo se a chamada falhar
    }
    router.replace("/admin/login");
  }

  // Considera ativo o item cujo href e o inicio do caminho atual. "/admin"
  // (Início) so fica ativo no match exato, para nao "acender" em toda tela.
  function estaAtivo(href: string): boolean {
    if (href === "/admin") return pathname === "/admin";
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <nav
      aria-label="Navegação do painel"
      className="flex gap-1 overflow-x-auto p-3 lg:h-full lg:w-64 lg:flex-col lg:overflow-y-auto lg:overflow-x-visible lg:border-r lg:border-neutral-200 lg:p-4"
    >
      <ul className="flex gap-1 lg:flex-1 lg:flex-col">
        {ADMIN_NAV.map((item) => {
          const ativo = estaAtivo(item.href);
          const conteudo = (
            <>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.6}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5 flex-shrink-0"
                aria-hidden="true"
              >
                <path d={item.icone} />
              </svg>
              <span className="whitespace-nowrap">{item.label}</span>
              {item.emBreve ? (
                <span className="ml-auto hidden rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-neutral-500 lg:inline">
                  em breve
                </span>
              ) : null}
            </>
          );

          const classeBase =
            "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition";

          return (
            <li key={item.href}>
              {item.emBreve ? (
                <span
                  aria-disabled="true"
                  title="Em breve"
                  className={`${classeBase} cursor-default text-neutral-400`}
                >
                  {conteudo}
                </span>
              ) : (
                <Link
                  href={item.href}
                  aria-current={ativo ? "page" : undefined}
                  className={`${classeBase} ${
                    ativo
                      ? "bg-brand text-brand-cream ring-1 ring-brand-gold/50"
                      : "text-brand hover:bg-brand-cream/60"
                  }`}
                >
                  {conteudo}
                </Link>
              )}
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        onClick={sair}
        disabled={saindo}
        className="ml-1 flex flex-shrink-0 items-center gap-2 rounded-xl border border-neutral-300 px-3 py-2.5 text-sm font-medium text-brand transition hover:bg-brand-cream/60 disabled:opacity-60 lg:ml-0 lg:mt-2"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5 flex-shrink-0"
          aria-hidden="true"
        >
          <path d="M15 12H3M3 12l4-4M3 12l4 4M11 4h6a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-6" />
        </svg>
        <span className="whitespace-nowrap">{saindo ? "Saindo..." : "Sair"}</span>
      </button>
    </nav>
  );
}
