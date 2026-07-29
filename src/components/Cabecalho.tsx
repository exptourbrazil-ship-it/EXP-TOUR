"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

const LOGO_URL = "https://exp-tour.com/wp-content/uploads/2026/04/EXP-Tour-Original-Logo.svg"

// Cabecalho compartilhado das telas do cliente: logo + menu de conta com o
// nome de quem esta logado e o botao "Sair". Antes o logout so existia na aba
// Financeiro e as demais telas mostravam um avatar nao clicavel — agora o
// acesso a conta e ao logout e consistente em todas as paginas.
export default function Cabecalho({ nome, subtitulo }: { nome: string | null; subtitulo?: string | null }) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [saindo, setSaindo] = useState(false)

  const temNome = !!(nome && nome.trim())
  const inicial = temNome ? nome!.trim().charAt(0).toUpperCase() : null

  async function sair() {
    setSaindo(true)
    try {
      await fetch("/api/auth/logout", { method: "POST" })
    } catch {
      // segue para o login mesmo se a chamada falhar
    }
    router.push("/")
  }

  return (
    <header className="relative mx-auto flex max-w-5xl items-center justify-between px-5 py-4 md:px-8">
      <img src={LOGO_URL} alt="EXP Tour" className="h-9" />

      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-label="Abrir menu da conta"
        className="flex h-9 w-9 items-center justify-center rounded-full bg-brand text-sm font-medium text-brand-cream transition hover:opacity-90"
      >
        {inicial ? (
          inicial
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-5 w-5">
            <circle cx="12" cy="8" r="3.2" />
            <path d="M5 20c0-3.3 3.1-5.5 7-5.5s7 2.2 7 5.5" strokeLinecap="round" />
          </svg>
        )}
      </button>

      {aberto ? (
        <>
          {/* Camada para fechar ao tocar fora */}
          <button
            type="button"
            aria-label="Fechar menu"
            onClick={() => setAberto(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div
            role="menu"
            className="absolute right-5 top-16 z-50 w-60 origin-top-right animate-scale-in rounded-2xl border border-neutral-200 bg-white p-4 shadow-xl md:right-8"
          >
            <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-golddark">Conta</p>
            <p className="mt-1 truncate font-serif text-lg text-brand" title={nome || undefined}>
              {temNome ? nome : "Minha conta"}
            </p>
            {subtitulo ? <p className="mt-0.5 truncate text-xs text-neutral-500">{subtitulo}</p> : null}
            <button
              type="button"
              onClick={sair}
              disabled={saindo}
              className="mt-4 w-full rounded-xl border border-neutral-300 py-2 text-sm font-medium text-brand transition hover:bg-brand-cream/60 disabled:opacity-60"
            >
              {saindo ? "Saindo..." : "Sair"}
            </button>
          </div>
        </>
      ) : null}
    </header>
  )
}
