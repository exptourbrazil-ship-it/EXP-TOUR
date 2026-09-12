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
  const det = await obterConteudoDetalheAdmin(supabase, tenantId, id);
  if (!det) notFound();

  const payload = (det.payload && typeof det.payload === "object" ? det.payload : {}) as Record<string, unknown>;
  const ficha = fichaDoSnapshot(payload.content, "pt-BR", payload.media);
  const detalhes = detalhesDoSnapshot({ programDetail: payload.programDetail }, "pt-BR");
  const prog = detalhes.programa;
  const pendente = det.status === "pending_admin";

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
                  <dt className="text-[10px] uppercase tracking-wide text-neutral-400">{l.rotulo}</dt>
                  <dd className="text-neutral-800">{l.valor}</dd>
                </div>
              ))}
            </dl>
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
