import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { exigirCapacidade } from "@/lib/admin-guard";
import { tenantIdAtual } from "@/lib/catalog-service";
import { obterPropostaDisponibilidade } from "@/lib/disponibilidade-proposta-service";
import PropostaDisponibilidadeClient from "./PropostaDisponibilidadeClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Revisao de uma PROPOSTA DE DISPONIBILIDADE lida por IA (F3.4): plano item a item
// (criar/alterar/igual, com o status publicado ao lado), avisos, e publicacao dos
// itens marcados. Capacidade fornecedores.gerir; tenant conferido no service.
export default async function PropostaDisponibilidadePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await exigirCapacidade("fornecedores.gerir", `/admin/disponibilidade/propostas/${id}`);
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string);
  const tenantId = await tenantIdAtual(supabase);
  const p = await obterPropostaDisponibilidade(supabase, tenantId, id);
  if (!p) notFound();
  const aplic = (p.aplicacao && typeof p.aplicacao === "object" ? p.aplicacao : null) as { aplicados?: number; falhas?: string[] } | null;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-3 flex flex-wrap gap-3 text-sm text-neutral-500">
        <Link href={`/admin/fornecedores/${p.supplierId}/disponibilidade`} className="hover:text-brand">← Disponibilidade do fornecedor</Link>
        <Link href={`/admin/fornecedores/${p.supplierId}/materiais`} className="hover:text-brand">Material →</Link>
      </div>
      <h1 className="mb-1 font-serif text-2xl text-brand">Datas lidas por IA</h1>
      <p className="mb-4 text-sm text-neutral-600">
        {p.supplierNome || "Fornecedor"} · de <strong>{p.sourceFilename || "material"}</strong> · {p.itens} data(s): {p.criar} nova(s), {p.alterar} alteração(ões)
        {p.status !== "pending_admin" ? ` · status: ${p.status}` : ""}
      </p>

      {p.avisos.length > 0 ? (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h2 className="mb-1 text-sm font-semibold text-amber-900">Avisos da auditoria por IA</h2>
          <ul className="list-disc pl-5 text-sm text-amber-900">{p.avisos.map((a, i) => <li key={i}>{a}</li>)}</ul>
        </div>
      ) : null}

      {p.status === "pending_admin" ? (
        <PropostaDisponibilidadeClient id={p.id} itens={p.plano.itens} />
      ) : (
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-600">
          {p.status === "approved" ? (
            <>Publicada: {aplic?.aplicados ?? 0} item(ns){aplic?.falhas?.length ? ` · ${aplic.falhas.length} falha(s): ${aplic.falhas.slice(0, 3).join("; ")}` : ""}.</>
          ) : p.status === "rejected" ? (
            <>Recusada{p.rejectReason ? `: ${p.rejectReason}` : ""}.</>
          ) : (
            <>Em processamento por outro admin. Se ficou presa, volta sozinha para a fila em alguns minutos — recarregue.</>
          )}
        </div>
      )}
    </div>
  );
}
