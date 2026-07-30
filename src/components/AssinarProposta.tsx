"use client";

import { useState } from "react";

// Assinatura eletrônica da proposta (Cláusula 17.1): marcação (checkbox) +
// clique em "Assinar". Ao confirmar, o back-end provisiona titular + contrato +
// parcela e registra o aceite (data/hora/IP/sessão/versão/hash). É o ato que
// celebra o contrato — daí a confirmação explícita e o texto de arrependimento.

export default function AssinarProposta({
  token,
  versaoTermo,
  nome,
}: {
  token: string;
  versaoTermo: string | null;
  nome: string | null;
}) {
  const [marcado, setMarcado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function assinar() {
    if (!marcado || enviando) return;
    setEnviando(true);
    setErro(null);
    try {
      const resp = await fetch(`/api/proposta/${encodeURIComponent(token)}/aceitar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await resp.json().catch(() => null);
      if (!resp.ok || !data?.ok) {
        setErro(data?.erro || "Não foi possível concluir a assinatura. Tente novamente.");
        setEnviando(false);
        return;
      }
      setOk(true);
    } catch {
      setErro("Falha de conexão. Verifique a internet e tente novamente.");
      setEnviando(false);
    }
  }

  if (ok) {
    return (
      <div className="mt-6 rounded-2xl border border-brand/30 bg-brand-cream/60 p-6 text-center">
        <h2 className="font-serif text-2xl text-brand">Contrato assinado ✓</h2>
        <p className="mt-2 text-sm text-brand">
          {nome ? `Obrigado, ${nome.trim().split(" ")[0]}. ` : ""}
          Enviamos um e-mail de boas-vindas com o acesso à sua Área do Cliente. Entre com o seu{" "}
          <strong>CPF</strong> para acompanhar pagamentos e documentos.
        </p>
        <p className="mt-3 text-xs text-neutral-600">
          Você tem <strong>7 dias</strong> para exercer o direito de arrependimento, se desejar,
          pela própria Área do Cliente.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-2xl border border-neutral-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-brand">Assinatura eletrônica</h2>
      <label className="mt-3 flex cursor-pointer items-start gap-3 text-sm text-neutral-700">
        <input
          type="checkbox"
          checked={marcado}
          onChange={(e) => setMarcado(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-brand"
        />
        <span>
          Li e aceito as <strong>Condições Gerais de Contratação</strong>
          {versaoTermo ? ` (versão ${versaoTermo})` : ""} e o <strong>Termo de Adesão</strong>, e
          declaro que esta marcação é a minha assinatura eletrônica, celebrando o contrato.
        </span>
      </label>

      {erro ? <p className="mt-3 text-sm text-red-600">{erro}</p> : null}

      <button
        type="button"
        onClick={assinar}
        disabled={!marcado || enviando}
        className="mt-4 w-full rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-brand-gold transition disabled:cursor-not-allowed disabled:opacity-40"
      >
        {enviando ? "Assinando…" : "Assinar e celebrar o contrato"}
      </button>

      <p className="mt-3 text-[11px] leading-relaxed text-neutral-500">
        Registramos data, hora e dados técnicos desta assinatura como prova (MP 2.200-2/2001).
        Após assinar, você tem <strong>7 dias</strong> de direito de arrependimento (art. 49 do CDC).
      </p>
    </div>
  );
}
