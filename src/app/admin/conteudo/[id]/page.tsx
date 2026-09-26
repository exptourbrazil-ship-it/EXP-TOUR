import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { exigirCapacidade } from "@/lib/admin-guard";
import { tenantIdAtual } from "@/lib/catalog-service";
import { obterConteudoDetalheAdmin } from "@/lib/content-admin-service";
import { fichaDoSnapshot, detalhesDoSnapshot } from "@/lib/produto-conteudo";
import ConteudoAprovacaoClient from "./ConteudoAprovacaoClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Rótulos de exibição da elegibilidade proposta — mesmo vocabulário do
// ElegibilidadeEditor (edição direta do admin), aqui só para leitura.
type EligRegra = { group_index?: number; attribute?: string; operator?: string; value?: unknown; is_blocking?: boolean };
const ATTR_LABEL: Record<string, string> = {
  age_at_start: "Idade no início", nationality: "Nacionalidade", residence_country: "País de residência",
  language_level: "Nível de idioma", education_level: "Nível de ensino", onshore_status: "Onshore/Offshore", has_visa: "Tem visto",
};
const OP_LABEL: Record<string, string> = { between: "entre", in: "em", not_in: "fora de", gte: ">=", lte: "<=", eq: "=" };
function textoValorElig(v: unknown): string {
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "boolean") return v ? "sim" : "não";
  return String(v ?? "");
}

// Revisão do conteúdo de programa proposto pela escola. Mostra o PREVIEW (como o
// estudante veria) + Aprovar/Rejeitar. Exige fornecedores.gerir.
export default async function AdminConteudoRevisaoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await exigirCapacidade("fornecedores.gerir", "/admin/conteudo");
  const { id } = await params;
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );
  const tenantId = await tenantIdAtual(supabase);
  const det = await obterConteudoDetalheAdmin(supabase, tenantId, id, "program");
  if (!det) notFound();

  const payload = (det.payload && typeof det.payload === "object" ? det.payload : {}) as Record<string, unknown>;
  const ficha = fichaDoSnapshot(payload.content, "pt-BR", payload.media);
  const detalhes = detalhesDoSnapshot({ programDetail: payload.programDetail }, "pt-BR");
  const prog = detalhes.programa;
  const pendente = det.status === "pending_admin";
  // Duração/disponibilidade proposta (min_duration/max_duration/available_from/
  // available_until) — aplicada em `product` na aprovação (não é ficha, por
  // isso não passa por detalhesDoSnapshot). Exibição direta e defensiva do bloco.
  const disp = (payload.disponibilidade && typeof payload.disponibilidade === "object" ? payload.disponibilidade : null) as
    | { min_duration?: number | null; max_duration?: number | null; available_from?: string | null; available_until?: string | null }
    | null;
  const temDisp = !!disp && (disp.min_duration != null || disp.max_duration != null || disp.available_from || disp.available_until);
  // Regras de elegibilidade propostas (eligibility_rule) — aplicadas em
  // `eligibility_rule` na aprovação (não é ficha, por isso exibição direta e
  // defensiva do bloco, igual à duração/disponibilidade acima).
  const regrasElig = Array.isArray(payload.elegibilidade) ? (payload.elegibilidade as EligRegra[]) : [];

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4">
        <Link href="/admin/conteudo" className="text-xs text-brand-golddark hover:underline">← Voltar à fila</Link>
      </div>
      <header className="mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-golddark">Revisão de conteúdo</p>
        <h1 className="mt-1 font-serif text-2xl text-brand">{det.productName || "(curso)"}</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {det.supplierName || "—"}{det.submittedBy ? ` · enviado por ${det.submittedBy}` : ""}
        </p>
      </header>

      {!pendente ? (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Este conteúdo não está pendente (status: {det.status}).
        </p>
      ) : null}

      {/* Preview */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-5">
        <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Como o estudante vê</h2>
        {ficha?.descriptionHtml ? (
          <div className="space-y-2 text-sm leading-relaxed text-neutral-800 [&_li]:ml-4 [&_li]:list-disc [&_ol]:list-decimal [&_ul]:list-disc" dangerouslySetInnerHTML={{ __html: ficha.descriptionHtml }} />
        ) : (
          <p className="text-sm text-neutral-400">Sem descrição.</p>
        )}
        {ficha?.isMachineTranslated ? <p className="mt-1 text-[11px] italic text-neutral-400">Tradução automática — sujeita a revisão.</p> : null}

        {ficha && ficha.highlights.length > 0 ? <Bloco titulo="Destaques" itens={ficha.highlights} /> : null}
        {ficha && ficha.inclusions.length > 0 ? <Bloco titulo="Inclui" itens={ficha.inclusions} /> : null}
        {ficha && ficha.exclusions.length > 0 ? <Bloco titulo="Não inclui" itens={ficha.exclusions} /> : null}

        {prog && prog.quickInfo.length > 0 ? (
          <div className="mt-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Ficha do curso</p>
            <dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
              {prog.quickInfo.map((l, i) => (
                <div key={i}>
                  <dt className="text-[11px] uppercase tracking-wide text-neutral-400">{l.rotulo}</dt>
                  <dd className="text-neutral-800">{l.valor}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}

        {prog && prog.timetable.length > 0 ? (
          <div className="mt-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Grade de horários</p>
            <ul className="mt-1 space-y-1 text-sm text-neutral-800">
              {prog.timetable.map((t, i) => (
                <li key={i}>
                  <span className="text-neutral-400">{t.dia}: </span>
                  <span className="inline-flex flex-wrap gap-x-3 gap-y-0.5">
                    {t.blocos.map((b, j) => {
                      const ehIntervalo = b.isIntervalo ?? b.descricao.toLowerCase().includes("intervalo");
                      const horario = b.inicio && b.fim ? `${b.inicio}–${b.fim}` : null;
                      return (
                        <span key={j} className={ehIntervalo ? "italic text-neutral-400" : undefined}>
                          {horario ? `${horario} ` : ""}
                          {b.descricao}
                        </span>
                      );
                    })}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {ficha && ficha.midias.length > 0 ? (
          <div className="mt-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Mídia ({ficha.midias.length})</p>
            <ul className="mt-1 space-y-0.5 text-sm">
              {ficha.midias.map((m, i) => (
                <li key={i}>
                  <a href={m.url} target="_blank" rel="noopener noreferrer nofollow" className="text-brand-golddark underline">
                    {m.caption || m.kind} — {m.url}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {temDisp ? (
          <div className="mt-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Duração e disponibilidade (aplicada ao produto na aprovação)</p>
            <dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
              <div><dt className="text-[11px] uppercase tracking-wide text-neutral-400">Duração mín.</dt><dd className="text-neutral-800">{disp?.min_duration != null ? `${disp.min_duration} sem.` : "—"}</dd></div>
              <div><dt className="text-[11px] uppercase tracking-wide text-neutral-400">Duração máx.</dt><dd className="text-neutral-800">{disp?.max_duration != null ? `${disp.max_duration} sem.` : "—"}</dd></div>
              <div><dt className="text-[11px] uppercase tracking-wide text-neutral-400">Disponível de</dt><dd className="text-neutral-800">{disp?.available_from || "—"}</dd></div>
              <div><dt className="text-[11px] uppercase tracking-wide text-neutral-400">Disponível até</dt><dd className="text-neutral-800">{disp?.available_until || "—"}</dd></div>
            </dl>
          </div>
        ) : null}

        {payload.elegibilidade !== undefined ? (
          <div className="mt-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
              Elegibilidade proposta (substitui as regras cadastradas na aprovação)
            </p>
            {regrasElig.length === 0 ? (
              <p className="mt-1 text-sm text-neutral-500">Sem regras — o produto ficaria elegível para todos.</p>
            ) : (
              <ul className="mt-1 space-y-1 text-sm text-neutral-800">
                {regrasElig.map((r, i) => (
                  <li key={i}>
                    <span className="text-neutral-400">grupo {r.group_index ?? 0}: </span>
                    {ATTR_LABEL[r.attribute ?? ""] ?? r.attribute} {OP_LABEL[r.operator ?? ""] ?? r.operator} {textoValorElig(r.value)}
                    {r.is_blocking ? <span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">bloqueante</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </div>

      {pendente ? <ConteudoAprovacaoClient id={det.id} /> : null}
    </div>
  );
}

function Bloco({ titulo, itens }: { titulo: string; itens: string[] }) {
  return (
    <div className="mt-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">{titulo}</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-neutral-800">
        {itens.map((t, i) => <li key={i}>{t}</li>)}
      </ul>
    </div>
  );
}
