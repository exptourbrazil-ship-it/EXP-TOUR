import Link from "next/link";
import { exigirAdmin } from "@/lib/admin-guard";
import { ADMIN_NAV } from "@/lib/admin-nav";
import { carregarFinanceiro } from "@/lib/admin-financeiro";
import { fmtBRL, fmtPorMoeda } from "@/lib/formato";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Home do painel admin. A verificacao completa da sessao (assinatura HMAC) e
// feita aqui via exigirAdmin; o proxy da borda ja barra quem nao tem cookie.
// Mostra os indicadores financeiros reais (Fase 1) com link para o Financeiro;
// a fila de documentos (Fase 2) segue como espaco reservado.
export default async function AdminHomePage() {
  const { usuario } = await exigirAdmin("/admin");

  // Best-effort: se o carregamento falhar, a home ainda renderiza (cards em "—").
  let financeiro = null as Awaited<ReturnType<typeof carregarFinanceiro>> | null;
  try {
    financeiro = await carregarFinanceiro();
  } catch {
    financeiro = null;
  }
  const m = financeiro?.metricas ?? null;

  // Secoes navegaveis (exclui a propria home).
  const secoes = ADMIN_NAV.filter((i) => i.href !== "/admin");

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-8">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-golddark">Painel</p>
        <h1 className="mt-1 font-serif text-3xl text-brand">Olá, {primeiroNome(usuario)}</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Visão geral da operação. Os indicadores financeiros já estão ativos; as filas de
          documentos e a saúde do sistema entram nas próximas fases.
        </p>
      </header>

      {/* Indicadores financeiros (Fase 1) + reservado (Fase 2) */}
      <section aria-label="Indicadores" className="mb-10">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-brand">Indicadores</h2>
          <Link href="/admin/financeiro" className="text-xs font-medium text-brand-golddark hover:underline">
            Ver Financeiro →
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <CardMetrica titulo="Recebido no mês" valor={m ? fmtBRL(m.recebidoMesBRL) : "—"} href="/admin/financeiro" />
          <CardMetrica
            titulo="A receber"
            valor={m ? fmtPorMoeda(m.aReceber.porMoeda) : "—"}
            legenda={m ? `${m.aReceber.count} parcela(s)` : undefined}
            href="/admin/financeiro"
          />
          <CardMetrica
            titulo="Em atraso"
            valor={m ? fmtPorMoeda(m.emAtraso.porMoeda) : "—"}
            legenda={m ? `${m.emAtraso.count} parcela(s)` : undefined}
            href="/admin/financeiro"
            tom="alerta"
          />
          <div className="rounded-2xl border border-dashed border-neutral-300 bg-white/60 p-4">
            <p className="text-xs font-medium text-neutral-500">Documentos pendentes</p>
            <p className="mt-2 font-serif text-2xl text-neutral-300">—</p>
            <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-brand-golddark">Fase 2</p>
          </div>
        </div>
      </section>

      {/* Atalhos das seções */}
      <section aria-label="Ferramentas">
        <h2 className="mb-3 text-sm font-semibold text-brand">Ferramentas</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {secoes.map((s) => {
            const conteudo = (
              <>
                <span
                  className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                    s.emBreve ? "bg-neutral-100 text-neutral-400" : "bg-brand-cream text-brand"
                  }`}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.6}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-5 w-5"
                    aria-hidden="true"
                  >
                    <path d={s.icone} />
                  </svg>
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className={`font-medium ${s.emBreve ? "text-neutral-400" : "text-brand"}`}>
                      {s.label}
                    </p>
                    {s.emBreve ? (
                      <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-neutral-500">
                        em breve
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-xs text-neutral-500">{s.descricao}</p>
                </div>
              </>
            );

            const classeBase =
              "flex items-start gap-3 rounded-2xl border border-neutral-200 bg-white p-4 transition";

            return s.emBreve ? (
              <div key={s.href} className={`${classeBase} cursor-default`} aria-disabled="true">
                {conteudo}
              </div>
            ) : (
              <Link
                key={s.href}
                href={s.href}
                className={`${classeBase} hover:-translate-y-0.5 hover:border-brand-gold/50 hover:shadow-md`}
              >
                {conteudo}
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function CardMetrica({
  titulo,
  valor,
  legenda,
  href,
  tom,
}: {
  titulo: string;
  valor: string;
  legenda?: string;
  href: string;
  tom?: "alerta";
}) {
  return (
    <Link
      href={href}
      className={`block rounded-2xl border bg-white p-4 transition hover:-translate-y-0.5 hover:shadow-md ${
        tom === "alerta" ? "border-red-200" : "border-neutral-200"
      }`}
    >
      <p className="text-xs font-medium text-neutral-500">{titulo}</p>
      <p className={`mt-2 font-serif text-xl ${tom === "alerta" ? "text-red-700" : "text-brand"}`}>
        {valor}
      </p>
      <p className="mt-1 text-xs text-neutral-400">{legenda ?? " "}</p>
    </Link>
  );
}

function primeiroNome(usuario: string): string {
  // O "usuario" pode ser um e-mail; mostra so a parte antes do @ ou o 1o nome.
  const base = usuario.includes("@") ? usuario.split("@")[0] : usuario;
  return base.split(/[.\s]/)[0].replace(/^\w/, (c) => c.toUpperCase());
}
