"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { fmtData, fmtMoeda } from "@/lib/formato";

export type QuoteRow = {
  id: string;
  reference: string;
  status: string;
  createdAt: string;
  studentName: string;
  // "Opcao-chave" (recomendada/1a) + subtotal bruto, para dar magnitude na linha.
  mainOptionLabel?: string | null;
  mainOptionTotal?: number | null;
  mainOptionCurrency?: string | null;
};

// Cada estado com cor propria (antes viewed/option_selected/converted eram
// identicos). option_selected = dourado (atencao: precisa de acao da equipe);
// converted = verde (sucesso); viewed = azul (info). Vermelho e permitido no admin.
const STATUS_BADGE: Record<string, string> = {
  draft: "bg-neutral-100 text-neutral-600",
  issued: "bg-amber-100 text-amber-800",
  viewed: "bg-sky-100 text-sky-700",
  option_selected: "bg-brand-gold/25 text-brand-golddark",
  expired: "bg-red-100 text-red-700",
  cancelled: "bg-neutral-100 text-neutral-500",
  converted: "bg-emerald-100 text-emerald-700",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Rascunho",
  issued: "Emitida",
  viewed: "Visualizada",
  option_selected: "Opção escolhida",
  expired: "Expirada",
  cancelled: "Cancelada",
  converted: "Convertida",
};

const VAZIO = {
  firstName: "",
  lastName: "",
  email: "",
  nationalityCode: "",
  presentmentCurrency: "BRL",
};

export default function QuotesListClient({ quotes }: { quotes: QuoteRow[] }) {
  const router = useRouter();
  const [abrindo, setAbrindo] = useState(false);
  const [form, setForm] = useState({ ...VAZIO });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("todos");

  // Busca por referencia/estudante + filtro por status (client-side). Escala a
  // triagem de muitas cotacoes sem depender de recarregar do servidor.
  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return quotes.filter((q) => {
      if (filtroStatus !== "todos" && q.status !== filtroStatus) return false;
      if (!termo) return true;
      return (
        q.reference.toLowerCase().includes(termo) ||
        (q.studentName || "").toLowerCase().includes(termo)
      );
    });
  }, [quotes, busca, filtroStatus]);

  const set = (campo: keyof typeof VAZIO) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [campo]: e.target.value }));

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      // 1) Estudante (quick-create).
      const resAluno = await fetch("/api/admin/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email || undefined,
          nationalityCode: form.nationalityCode || undefined,
        }),
      });
      const jsonAluno = await resAluno.json();
      if (!resAluno.ok || !jsonAluno.ok) {
        throw new Error(jsonAluno?.error?.message || "Falha ao criar estudante.");
      }

      // 2) Cotacao.
      const resQuote = await fetch("/api/admin/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: jsonAluno.data.studentId,
          presentmentCurrency: form.presentmentCurrency || "BRL",
        }),
      });
      const jsonQuote = await resQuote.json();
      if (!resQuote.ok || !jsonQuote.ok) {
        throw new Error(jsonQuote?.error?.message || "Falha ao criar cotação.");
      }

      router.push(`/admin/quotes/${jsonQuote.data.quoteId}`);
    } catch (e: any) {
      setErro(e?.message || "Erro de rede.");
      setSalvando(false);
    }
  }

  const inputClasse =
    "mt-1 block w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm";

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-golddark">
            Painel
          </p>
          <h1 className="mt-1 font-serif text-3xl text-brand">Cotações</h1>
          <p className="mt-2 text-sm text-neutral-600">
            Monte cotações com múltiplas opções comparáveis, emita e compartilhe o link
            público — o câmbio fica congelado na emissão.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAbrindo((v) => !v)}
          className="rounded-xl bg-brand-gold px-4 py-2.5 text-sm font-semibold text-brand transition hover:opacity-90"
        >
          {abrindo ? "Fechar" : "Nova cotação"}
        </button>
      </header>

      {erro ? (
        <p className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {erro}
        </p>
      ) : null}

      {abrindo ? (
        <form
          onSubmit={criar}
          className="mb-8 animate-scale-in rounded-2xl border border-brand-gold/40 bg-white p-4"
        >
          <h2 className="mb-3 text-sm font-semibold text-brand">
            Nova cotação (cadastro rápido do estudante)
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium text-brand">
              Nome
              <input type="text" value={form.firstName} onChange={set("firstName")} required className={inputClasse} />
            </label>
            <label className="text-sm font-medium text-brand">
              Sobrenome
              <input type="text" value={form.lastName} onChange={set("lastName")} required className={inputClasse} />
            </label>
            <label className="text-sm font-medium text-brand">
              E-mail (opcional)
              <input type="email" value={form.email} onChange={set("email")} className={inputClasse} />
            </label>
            <label className="text-sm font-medium text-brand">
              Nacionalidade (ISO-2, opcional)
              <input
                type="text"
                value={form.nationalityCode}
                onChange={(e) =>
                  setForm((f) => ({ ...f, nationalityCode: e.target.value.toUpperCase().slice(0, 2) }))
                }
                placeholder="BR"
                className={inputClasse}
              />
            </label>
            <label className="text-sm font-medium text-brand">
              Moeda de apresentação
              <input
                type="text"
                value={form.presentmentCurrency}
                onChange={(e) =>
                  setForm((f) => ({ ...f, presentmentCurrency: e.target.value.toUpperCase().slice(0, 3) }))
                }
                placeholder="BRL"
                className={inputClasse}
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={salvando}
            className="mt-4 rounded-xl bg-brand-gold px-4 py-2.5 text-sm font-semibold text-brand transition hover:opacity-90 disabled:opacity-60"
          >
            {salvando ? "Criando…" : "Criar e abrir construtor"}
          </button>
        </form>
      ) : null}

      <h2 className="mb-3 text-sm font-semibold text-brand">Suas cotações</h2>

      {quotes.length > 0 ? (
        <div className="mb-3 flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por referência ou estudante"
            className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm sm:flex-1"
          />
          <select
            value={filtroStatus}
            onChange={(e) => setFiltroStatus(e.target.value)}
            className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm sm:w-56"
          >
            <option value="todos">Todos os status</option>
            {Object.keys(STATUS_LABEL).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {quotes.length === 0 ? (
        <p className="text-sm text-neutral-500">Nenhuma cotação ainda.</p>
      ) : filtradas.length === 0 ? (
        <p className="text-sm text-neutral-500">Nenhuma cotação para a busca/filtro.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {filtradas.map((q) => (
            <li key={q.id}>
              <Link
                href={`/admin/quotes/${q.id}`}
                className="block rounded-xl border border-neutral-200 bg-white p-3 transition hover:border-brand-gold/60 hover:bg-brand-cream/40"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-serif text-lg text-brand">#{q.reference}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                      STATUS_BADGE[q.status] || "bg-neutral-100 text-neutral-600"
                    }`}
                  >
                    {STATUS_LABEL[q.status] || q.status}
                  </span>
                </div>
                <div className="mt-0.5 text-sm text-neutral-600">{q.studentName}</div>
                {q.mainOptionTotal != null && q.mainOptionCurrency ? (
                  <div className="mt-0.5 text-xs text-neutral-500">
                    {q.mainOptionLabel} · {fmtMoeda(q.mainOptionTotal, q.mainOptionCurrency)}
                  </div>
                ) : null}
                <div className="mt-0.5 text-xs text-neutral-400">
                  criada em {fmtData(q.createdAt)}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
