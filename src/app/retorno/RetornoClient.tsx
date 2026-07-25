"use client"

import { useState } from "react"
import BottomNav from "@/components/BottomNav"
import { montarLinkIndicacaoWhatsApp } from "@/lib/nps"

type Contrato = {
  id: string
  nome: string | null
  estudante_nome?: string | null
}

type Certificado = {
  id: string
  nome_arquivo: string | null
  created_at: string | null
}

type NpsExistente = {
  nota: number | null
  comentario: string | null
}

type RetornoClientProps = {
  nomeCompleto: string | null
  contrato: Contrato | null
  certificados: Certificado[]
  npsExistente: NpsExistente | null
  googleReviewUrl: string | null
  portalUrl: string | null
}

const LOGO_URL = "https://exp-tour.com/wp-content/uploads/2026/04/EXP-Tour-Original-Logo.svg"

function primeiroNome(nomeCompleto: string | null): string {
  if (!nomeCompleto) return ""
  return nomeCompleto.trim().split(" ")[0]
}

export default function RetornoClient(props: RetornoClientProps) {
  // A tela acompanha a jornada do ESTUDANTE; usa o nome dele quando existir.
  const nomeExibicao = (props.contrato && props.contrato.estudante_nome) ? props.contrato.estudante_nome : props.nomeCompleto
  const nome = primeiroNome(nomeExibicao)

  const [nota, setNota] = useState<number | null>(props.npsExistente ? props.npsExistente.nota : null)
  const [comentario, setComentario] = useState<string>(props.npsExistente?.comentario || "")
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState<boolean>(!!props.npsExistente)
  const [erro, setErro] = useState<string>("")

  async function enviarNps() {
    if (nota === null) {
      setErro("Escolha uma nota de 0 a 10.")
      return
    }
    setEnviando(true)
    setErro("")
    try {
      const resp = await fetch("/api/nps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nota, comentario, contratoId: props.contrato ? props.contrato.id : null }),
      })
      const json = await resp.json().catch(() => ({}))
      if (!resp.ok || !json.ok) {
        setErro(json.erro || "Nao foi possivel enviar. Tente novamente.")
      } else {
        setEnviado(true)
      }
    } catch {
      setErro("Falha de conexao. Tente novamente.")
    } finally {
      setEnviando(false)
    }
  }

  const linkIndicacao = montarLinkIndicacaoWhatsApp(nomeExibicao, props.portalUrl)
  const temCertificado = props.certificados.length > 0

  return (
    <div className="min-h-screen bg-brand-cream/40 pb-28">
      <header className="flex items-center justify-between px-5 py-4">
        <img src={LOGO_URL} alt="EXP TOUR" className="h-6" />
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand text-sm font-medium text-brand-cream">
          {nome ? nome.charAt(0).toUpperCase() : "?"}
        </div>
      </header>

      <main className="mx-auto max-w-md px-5 py-2">
        <h1 className="font-serif text-4xl text-brand">Bem-vindo de volta{nome ? ", " + nome : ""}</h1>
        <p className="mt-2 text-sm text-neutral-500">
          O fim de uma jornada &mdash; e o comeco das proximas historias.
        </p>

        {/* Certificado de conclusao */}
        <section className="mt-6 rounded-3xl bg-brand p-6 text-brand-cream shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-gold">
            Seu certificado
          </p>
          {temCertificado ? (
            <div className="mt-3 space-y-3">
              <p className="text-sm text-brand-cream/80">
                Seu certificado de conclusao esta disponivel no cofre.
              </p>
              {props.certificados.map((c) => (
                <a
                  key={c.id}
                  href={"/api/documentos/" + c.id + "/download"}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between rounded-xl bg-brand-cream/10 px-4 py-3 text-sm transition hover:bg-brand-cream/20"
                >
                  <span className="truncate">{c.nome_arquivo || "Certificado de Conclusao"}</span>
                  <span className="ml-3 shrink-0 text-brand-gold">Baixar &darr;</span>
                </a>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-brand-cream/80">
              Assim que sua escola emitir o certificado de conclusao, ele aparecera aqui.
            </p>
          )}
        </section>

        {/* Avaliacao NPS */}
        <section className="mt-5 rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-gold">
            Sua opiniao
          </p>
          {enviado ? (
            <div className="mt-2">
              <h2 className="font-serif text-2xl text-brand">Obrigado pela sua avaliacao!</h2>
              <p className="mt-2 text-sm text-neutral-500">
                Sua nota{nota !== null ? " (" + nota + "/10)" : ""} foi registrada. Se quiser mudar, e so avaliar de novo abaixo.
              </p>
              <button
                onClick={() => setEnviado(false)}
                className="mt-4 text-sm font-medium text-brand underline"
              >
                Revisar minha avaliacao
              </button>
            </div>
          ) : (
            <div className="mt-2">
              <h2 className="font-serif text-2xl text-brand">O quanto voce recomendaria a EXP Tour?</h2>
              <p className="mt-2 text-sm text-neutral-500">De 0 (nada provavel) a 10 (com certeza).</p>
              <div className="mt-4 grid grid-cols-6 gap-2">
                {Array.from({ length: 11 }, (_, n) => (
                  <button
                    key={n}
                    onClick={() => setNota(n)}
                    className={
                      "aspect-square rounded-lg text-sm font-medium transition " +
                      (nota === n
                        ? "bg-brand text-brand-cream"
                        : "border border-neutral-300 text-neutral-600 hover:border-brand")
                    }
                  >
                    {n}
                  </button>
                ))}
              </div>
              <textarea
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
                placeholder="Quer contar algo sobre sua experiencia? (opcional)"
                rows={3}
                className="mt-4 w-full rounded-xl border border-neutral-300 p-3 text-sm text-neutral-700 outline-none focus:border-brand"
              />
              {erro ? <p className="mt-2 text-sm text-red-600">{erro}</p> : null}
              <button
                onClick={enviarNps}
                disabled={enviando}
                className="mt-4 block w-full rounded-xl bg-brand py-3 text-center text-sm font-medium text-brand-cream transition hover:opacity-90 disabled:opacity-60"
              >
                {enviando ? "Enviando..." : "Enviar avaliacao"}
              </button>
            </div>
          )}
        </section>

        {/* Convite para avaliar no Google */}
        {props.googleReviewUrl ? (
          <section className="mt-5 rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-gold">
              Avalie no Google
            </p>
            <h2 className="mt-2 font-serif text-2xl text-brand">Sua avaliacao ajuda muito</h2>
            <p className="mt-2 text-sm text-neutral-500">
              Um minutinho para deixar uma estrela faz toda a diferenca para quem ainda esta decidindo.
            </p>
            <a
              href={props.googleReviewUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-5 block rounded-xl bg-brand py-3 text-center text-sm font-medium text-brand-cream transition hover:opacity-90"
            >
              Avaliar no Google
            </a>
          </section>
        ) : null}

        {/* Indicacao via WhatsApp */}
        <section className="mt-5 rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-gold">
            Indique um amigo
          </p>
          <h2 className="mt-2 font-serif text-2xl text-brand">Conhece alguem querendo estudar fora?</h2>
          <p className="mt-2 text-sm text-neutral-500">
            Compartilhe a EXP Tour com quem esta pensando em fazer intercambio.
          </p>
          <a
            href={linkIndicacao}
            target="_blank"
            rel="noreferrer"
            className="mt-5 block rounded-xl border border-brand py-3 text-center text-sm font-medium text-brand transition hover:bg-brand hover:text-brand-cream"
          >
            Compartilhar no WhatsApp
          </a>
        </section>
      </main>

      <BottomNav />
    </div>
  )
}
