"use client";

import { useState } from "react";
import { montarLinkSuporteWhatsApp, WHATSAPP_EXP_TOUR } from "@/lib/viagem";
import Logo from "@/components/Logo";

type Etapa = "cpf" | "codigo";
// A mensagem carrega o TIPO, para o cliente distinguir sucesso de erro num
// relance (antes os dois usavam o mesmo estilo e "código enviado" ficava
// igual a "CPF inválido"). Nunca usamos vermelho na Area do Cliente: erro
// vai em ambar, sucesso em verde, sempre com icone + texto.
type Mensagem = { tipo: "erro" | "sucesso"; texto: string } | null;

// Mascara progressiva de CPF (000.000.000-00) so para exibicao; a API
// normaliza tirando os nao-digitos, entao enviar formatado nao quebra nada.
function formatarCpf(valor: string): string {
  const d = valor.replace(/\D/g, "").slice(0, 11);
  if (d.length > 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length > 6) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  if (d.length > 3) return `${d.slice(0, 3)}.${d.slice(3)}`;
  return d;
}

export default function LoginPage() {
  const [etapa, setEtapa] = useState<Etapa>("cpf");
  const [cpf, setCpf] = useState("");
  const [codigo, setCodigo] = useState("");
  const [loading, setLoading] = useState(false);
  const [mensagem, setMensagem] = useState<Mensagem>(null);

  async function handleSolicitarCodigo(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMensagem(null);
    try {
      const res = await fetch("/api/auth/request-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cpf }),
      });
      if (!res.ok) throw new Error("Falha ao solicitar codigo");
      setEtapa("codigo");
      setMensagem({ tipo: "sucesso", texto: "Código enviado para o seu e-mail." });
    } catch {
      setMensagem({ tipo: "erro", texto: "Não foi possível enviar o código. Verifique o CPF informado." });
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmarCodigo(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMensagem(null);
    try {
      const res = await fetch("/api/auth/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cpf, codigo }),
      });
      const resultado = await res.json();
      if (!res.ok || !resultado.success) {
        setMensagem({ tipo: "erro", texto: resultado.error || "Código inválido ou expirado." });
        return;
      }
      window.location.href = "/inicio";
    } catch {
      setMensagem({ tipo: "erro", texto: "Não foi possível confirmar o código." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6">
      <div className="mb-6 flex justify-center">
        <Logo escuro />
      </div>

      <div className="w-full max-w-md rounded-xl bg-brand-cream p-8 shadow-lg animate-fade-in-up">
        <h1 className="mb-2 text-3xl font-semibold text-brand">Área do cliente</h1>

        {etapa === "cpf" ? (
          <>
            <p className="mb-6 text-base text-brand">
              Informe seu CPF. Enviaremos um código de acesso para o seu e-mail — você verá apenas os seus contratos.
            </p>
            <form onSubmit={handleSolicitarCodigo} className="space-y-4">
              <div>
                <label htmlFor="cpf" className="mb-1 block text-base font-medium text-brand">
                  CPF
                </label>
                <input
                  id="cpf"
                  name="cpf"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  required
                  value={cpf}
                  onChange={(e) => setCpf(formatarCpf(e.target.value))}
                  placeholder="000.000.000-00"
                  className="w-full rounded-md border border-neutral-300 bg-white px-3 py-3 text-base focus:border-brand focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-md bg-brand px-4 py-3 text-base font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {loading ? "Enviando..." : "Receber código por e-mail"}
              </button>
            </form>
          </>
        ) : (
          <>
            <p className="mb-6 text-base text-brand">
              Digite o código de 6 dígitos que enviamos para o seu e-mail.
            </p>
            <form onSubmit={handleConfirmarCodigo} className="space-y-4">
              <div>
                <label htmlFor="codigo" className="mb-1 block text-base font-medium text-brand">
                  Código de acesso
                </label>
                <input
                  id="codigo"
                  name="codigo"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]*"
                  required
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  maxLength={6}
                  className="w-full rounded-md border border-neutral-300 bg-white px-3 py-3 text-center text-2xl tracking-[0.4em] focus:border-brand focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-md bg-brand px-4 py-3 text-base font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {loading ? "Confirmando..." : "Confirmar código"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEtapa("cpf");
                  setMensagem(null);
                  setCodigo("");
                }}
                className="w-full py-2 text-center text-base text-brand underline"
              >
                Usar outro CPF
              </button>
            </form>
          </>
        )}

        {mensagem ? (
          <div
            role={mensagem.tipo === "erro" ? "alert" : "status"}
            className={
              "mt-4 flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm " +
              (mensagem.tipo === "erro"
                ? "border-amber-300 bg-amber-50 text-amber-900"
                : "border-emerald-300 bg-emerald-50 text-emerald-800")
            }
          >
            <span aria-hidden="true" className="mt-0.5 shrink-0">
              {mensagem.tipo === "erro" ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-4 w-4">
                  <path d="M12 9v4" strokeLinecap="round" />
                  <path d="M12 17h.01" strokeLinecap="round" />
                  <path d="M10.3 4.3 2.6 18a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0z" strokeLinejoin="round" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-4 w-4">
                  <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </span>
            <span>{mensagem.texto}</span>
          </div>
        ) : null}
      </div>

      <p className="mt-6 text-center text-sm text-brand-cream/80">
        Precisa de ajuda?{" "}
        <a
          href={montarLinkSuporteWhatsApp()}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-brand-cream underline"
        >
          WhatsApp {WHATSAPP_EXP_TOUR}
        </a>
      </p>
    </main>
  );
}
