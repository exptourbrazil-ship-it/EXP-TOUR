import Link from "next/link";
import { exigirAdmin } from "@/lib/admin-guard";
import { ADMIN_NAV } from "@/lib/admin-nav";
import { carregarFinanceiro } from "@/lib/admin-financeiro";
import { contarDocumentosPendentes } from "@/lib/admin-operacao";
import { carregarFilaDoDia, type FilaDoDia } from "@/lib/admin-fila";
import { ESTADO_LABEL, type EstadoPrazo, type ItemFila } from "@/lib/fila-do-dia";
import { PAPEL_LABEL } from "@/lib/admin-roles";
import { fmtBRL, fmtPorMoeda } from "@/lib/formato";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Home do painel admin. A verificacao completa da sessao (assinatura HMAC) e
// feita aqui via exigirAdmin; o proxy da borda ja barra quem nao tem cookie.
// Mostra os indicadores financeiros reais (Fase 1) com link para o Financeiro;
// a fila de documentos (Fase 2) segue como espaco reservado.
export default async function AdminHomePage() {
  const { usuario, papel } = await exigirAdmin("/admin");

  // Best-effort: se o carregamento falhar, a home ainda renderiza (cards em "—").
  let financeiro = null as Awaited<ReturnType<typeof carregarFinanceiro>> | null;
  try {
    financeiro = await carregarFinanceiro();
  } catch {
    financeiro = null;
  }
  const m = financeiro?.metricas ?? null;

  // Contagem da fila de documentos (Fase 2). Best-effort: 0 se falhar.
  let docsPendentes = 0;
  try {
    docsPendentes = await contarDocumentosPendentes();
  } catch {
    docsPendentes = 0;
  }

  // Fila do Dia, filtrada pelo papel do usuario (gestor ve tudo). Best-effort:
  // se falhar, a home ainda renderiza sem a fila.
  let fila = null as FilaDoDia | null;
  try {
    fila = await carregarFilaDoDia(Date.now(), papel);
  } catch {
    fila = null;
  }

  // Secoes navegaveis (exclui a propria home).
  const secoes = ADMIN_NAV.filter((i) => i.href !== "/admin");

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-8">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-golddark">Painel</p>
        <h1 className="mt-1 font-serif text-3xl text-brand">Olá, {primeiroNome(usuario)}</h1>
        <p className="mt-2 text-sm text-neutral-600">
          O que precisa da sua atenção hoje, priorizado automaticamente. Os indicadores
          financeiros e as ferramentas ficam logo abaixo.
        </p>
      </header>

      {/* Fila do Dia: o que precisa de atenção, priorizado (doc 07, 3.1) */}
      <section aria-label="Fila do Dia" className="mb-10">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-brand">
            Fila do Dia
            {papel !== "gestor" ? (
              <span className="ml-2 font-normal text-neutral-400">· {PAPEL_LABEL[papel]}</span>
            ) : null}
          </h2>
          {fila && fila.contadores.total > 0 ? (
            <span className="text-xs text-neutral-500">
              {fila.contadores.total} item(ns)
              {fila.contadores.estourados > 0 ? (
                <span className="text-red-700"> · {fila.contadores.estourados} com SLA estourado</span>
              ) : null}
            </span>
          ) : null}
        </div>

        {!fila || fila.itens.length === 0 ? (
          <div className="rounded-2xl border border-neutral-200 bg-white p-6 text-center">
            <p className="text-sm text-neutral-600">
              {fila ? "Nada pendente por aqui. Fila zerada. 🎉" : "Não foi possível carregar a fila agora."}
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {fila.itens.map((item, i) => (
              <FilaLinha key={i} item={item} />
            ))}
          </ul>
        )}
      </section>

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
          <CardMetrica
            titulo="Documentos pendentes"
            valor={String(docsPendentes)}
            legenda="aguardando revisão"
            href="/admin/documentos"
            tom={docsPendentes > 0 ? "alerta" : undefined}
          />
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

// Icone por categoria da fila (path do SVG). "outro" e o fallback.
const ICONE_CATEGORIA: Record<string, string> = {
  documento:
    "M14 3v4a1 1 0 0 0 1 1h4M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z",
  parcela: "M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
  excecao:
    "M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01",
  outro: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 8v4M12 16h.01",
};

function ChipEstado({ estado }: { estado: EstadoPrazo }) {
  const cor =
    estado === "estourado" ? "bg-red-500" : estado === "hoje" ? "bg-brand-gold" : "bg-emerald-500";
  const texto =
    estado === "estourado"
      ? "text-red-700"
      : estado === "hoje"
      ? "text-brand-golddark"
      : "text-emerald-700";
  return (
    <span
      className={`hidden shrink-0 items-center gap-1.5 rounded-full border border-neutral-200 px-2.5 py-1 text-[11px] font-medium sm:inline-flex ${texto}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${cor}`} aria-hidden="true" />
      {ESTADO_LABEL[estado]}
    </span>
  );
}

function FilaLinha({ item }: { item: ItemFila }) {
  const icone = ICONE_CATEGORIA[item.categoria] ?? ICONE_CATEGORIA.outro;
  return (
    <li className="flex items-center gap-3 rounded-2xl border border-neutral-200 bg-white p-4">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-cream text-brand">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4"
          aria-hidden="true"
        >
          <path d={icone} />
        </svg>
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-brand">{item.titulo}</p>
        <p className="mt-0.5 truncate text-xs text-neutral-500">
          {item.contexto ? item.contexto + " · " : ""}há {item.idadeDias} dia(s)
        </p>
      </div>
      <ChipEstado estado={item.estado} />
      {item.href ? (
        <Link
          href={item.href}
          className="shrink-0 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-brand-cream hover:opacity-90"
        >
          Abrir
        </Link>
      ) : null}
    </li>
  );
}

function primeiroNome(usuario: string): string {
  // O "usuario" pode ser um e-mail; mostra so a parte antes do @ ou o 1o nome.
  const base = usuario.includes("@") ? usuario.split("@")[0] : usuario;
  return base.split(/[.\s]/)[0].replace(/^\w/, (c) => c.toUpperCase());
}
