import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { exigirCapacidade } from "@/lib/admin-guard";
import { tenantIdAtual } from "@/lib/catalog-service";
import { obterConteudoCampusDetalheAdmin } from "@/lib/campus-content-admin-service";
import { detalhesDoSnapshot } from "@/lib/produto-conteudo";
import ConteudoEscolaAprovacaoClient from "./ConteudoEscolaAprovacaoClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Revisão do conteúdo de ESCOLA. Mostra o PREVIEW (bloco "Sobre a escola") +
// Aprovar/Rejeitar. Exige fornecedores.gerir.
export default async function AdminConteudoEscolaRevisaoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await exigirCapacidade("fornecedores.gerir", "/admin/conteudo-escolas");
  const { id } = await params;
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );
  const tenantId = await tenantIdAtual(supabase);
  const det = await obterConteudoCampusDetalheAdmin(supabase, tenantId, id);
  if (!det) notFound();

  const payload = (det.payload && typeof det.payload === "object" ? det.payload : {}) as Record<string, unknown>;
  // Monta um pseudo-snapshot de campus para reusar o parser de exibição.
  const escola = detalhesDoSnapshot({
    campus: {
      id: det.campusId,
      name: det.campusNome,
      content: payload.content ?? [],
      media: payload.media ?? [],
      amenities: payload.amenities ?? [],
      accreditations: payload.accreditations ?? [],
      nationality_mix: payload.nationalityMix ?? [],
    },
  }, "pt-BR").escola;
  const pendente = det.status === "pending_admin";

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4">
        <Link href="/admin/conteudo-escolas" className="text-xs text-brand-golddark hover:underline">← Voltar à fila</Link>
      </div>
      <header className="mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-golddark">Revisão de conteúdo · escola</p>
        <h1 className="mt-1 font-serif text-2xl text-brand">{det.campusNome || "(escola)"}</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {det.supplierName || "—"}{det.submittedBy ? ` · enviado por ${det.submittedBy}` : ""}
        </p>
      </header>

      {!pendente ? (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Este conteúdo não está pendente (status: {det.status}).
        </p>
      ) : null}

      <div className="rounded-2xl border border-neutral-200 bg-white p-5">
        <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Como o estudante vê — Sobre a escola</h2>
        {!escola ? (
          <p className="text-sm text-neutral-400">Sem conteúdo para exibir.</p>
        ) : (
          <>
            <p className="text-neutral-800">{escola.nome}{escola.local ? <span className="text-neutral-400"> · {escola.local}</span> : null}</p>
            {escola.descriptionHtml ? (
              <div className="mt-2 space-y-2 text-sm leading-relaxed text-neutral-800 [&_li]:ml-4 [&_li]:list-disc [&_ul]:list-disc" dangerouslySetInnerHTML={{ __html: escola.descriptionHtml }} />
            ) : null}
            {escola.highlights.length > 0 ? <Bloco titulo="Destaques" itens={escola.highlights} /> : null}
            {escola.amenities.length > 0 ? <Bloco titulo="Estrutura" itens={escola.amenities} /> : null}
            {escola.accreditations.length > 0 ? <Bloco titulo="Acreditações" itens={escola.accreditations} /> : null}
            {escola.nationalityMix.length > 0 ? (
              <div className="mt-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Mix de nacionalidades</p>
                <ul className="mt-1 text-sm text-neutral-800">
                  {escola.nationalityMix.map((n, i) => <li key={i}>{n.pais}: {Math.round(n.percentual)}%</li>)}
                </ul>
              </div>
            ) : null}
            {escola.midias.length > 0 ? (
              <div className="mt-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Mídia ({escola.midias.length})</p>
                <ul className="mt-1 space-y-0.5 text-sm">
                  {escola.midias.map((m, i) => (
                    <li key={i}><a href={m.url} target="_blank" rel="noopener noreferrer nofollow" className="text-brand-golddark underline">{m.caption || m.kind} — {m.url}</a></li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        )}
      </div>

      {pendente ? <ConteudoEscolaAprovacaoClient id={det.id} /> : null}
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
