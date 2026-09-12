import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { exigirCapacidade } from "@/lib/admin-guard";
import { tenantIdAtual } from "@/lib/catalog-service";
import { obterConteudoDetalheAdmin } from "@/lib/content-admin-service";
import { fichaDoSnapshot, detalhesDoSnapshot } from "@/lib/produto-conteudo";
import ConteudoAcomodacaoAprovacaoClient from "./ConteudoAcomodacaoAprovacaoClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Revisão do conteúdo de ACOMODAÇÃO. Mostra o PREVIEW + Aprovar/Rejeitar.
export default async function AdminConteudoAcomodacaoRevisaoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await exigirCapacidade("fornecedores.gerir", "/admin/conteudo-acomodacoes");
  const { id } = await params;
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );
  const tenantId = await tenantIdAtual(supabase);
  const det = await obterConteudoDetalheAdmin(supabase, tenantId, id, "accommodation");
  if (!det) notFound();

  const payload = (det.payload && typeof det.payload === "object" ? det.payload : {}) as Record<string, unknown>;
  const ficha = fichaDoSnapshot(payload.content, "pt-BR", payload.media);
  const acom = detalhesDoSnapshot({ accommodationDetail: payload.accommodationDetail }, "pt-BR").acomodacao;
  const pendente = det.status === "pending_admin";

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4">
        <Link href="/admin/conteudo-acomodacoes" className="text-xs text-brand-golddark hover:underline">← Voltar à fila</Link>
      </div>
      <header className="mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-golddark">Revisão de conteúdo · acomodação</p>
        <h1 className="mt-1 font-serif text-2xl text-brand">{det.productName || "(acomodação)"}</h1>
        <p className="mt-1 text-sm text-neutral-500">{det.supplierName || "—"}{det.submittedBy ? ` · enviado por ${det.submittedBy}` : ""}</p>
      </header>

      {!pendente ? (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Este conteúdo não está pendente (status: {det.status}).
        </p>
      ) : null}

      <div className="rounded-2xl border border-neutral-200 bg-white p-5">
        <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Como o estudante vê</h2>
        {ficha?.descriptionHtml ? (
          <div className="space-y-2 text-sm leading-relaxed text-neutral-800 [&_li]:ml-4 [&_li]:list-disc [&_ul]:list-disc" dangerouslySetInnerHTML={{ __html: ficha.descriptionHtml }} />
        ) : <p className="text-sm text-neutral-400">Sem descrição.</p>}
        {ficha && ficha.highlights.length > 0 ? <Bloco titulo="Destaques" itens={ficha.highlights} /> : null}
        {ficha && ficha.inclusions.length > 0 ? <Bloco titulo="Inclui" itens={ficha.inclusions} /> : null}
        {ficha && ficha.exclusions.length > 0 ? <Bloco titulo="Não inclui" itens={ficha.exclusions} /> : null}

        {acom && acom.linhas.length > 0 ? (
          <div className="mt-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Ficha da acomodação</p>
            <dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
              {acom.linhas.map((l, i) => (
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
                <li key={i}><a href={m.url} target="_blank" rel="noopener noreferrer nofollow" className="text-brand-golddark underline">{m.caption || m.kind} — {m.url}</a></li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {pendente ? <ConteudoAcomodacaoAprovacaoClient id={det.id} /> : null}
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
