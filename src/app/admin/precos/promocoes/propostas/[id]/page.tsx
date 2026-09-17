import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { exigirCapacidade } from "@/lib/admin-guard";
import { tenantIdAtual } from "@/lib/catalog-service";
import { obterPropostaPromocao } from "@/lib/promocao-proposta-service";
import { listarCampusDoFornecedor } from "@/lib/fornecedor-hub-service";
import { listarProdutosDoFornecedor } from "@/lib/content-submission-service";
import PropostaPromocaoClient from "./PropostaPromocaoClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Revisao de uma PROPOSTA DE PROMOCAO lida por IA (F3.3): o admin ve o que a IA leu
// (texto literal das condicoes), os avisos, ajusta os campos e PUBLICA (cria a
// promocao ativa) ou recusa. Capacidade fornecedores.gerir; tenant conferido no service.
export default async function PropostaPromocaoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await exigirCapacidade("fornecedores.gerir", `/admin/precos/promocoes/propostas/${id}`);
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string);
  const tenantId = await tenantIdAtual(supabase);
  const p = await obterPropostaPromocao(supabase, tenantId, id);
  if (!p) notFound();

  const [campi, programas, acomodacoes] = await Promise.all([
    listarCampusDoFornecedor(supabase, tenantId, p.supplierId),
    listarProdutosDoFornecedor(supabase, p.supplierId, "program"),
    listarProdutosDoFornecedor(supabase, p.supplierId, "accommodation"),
  ]);
  const produtos = [...programas.map((x) => ({ id: x.id, nome: `${x.name} (curso)` })), ...acomodacoes.map((x) => ({ id: x.id, nome: `${x.name} (acomodação)` }))];

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-3 flex flex-wrap gap-3 text-sm text-neutral-500">
        <Link href="/admin/precos/promocoes" className="hover:text-brand">← Promoções</Link>
        <Link href={`/admin/fornecedores/${p.supplierId}/materiais`} className="hover:text-brand">Material do fornecedor →</Link>
      </div>
      <h1 className="mb-1 font-serif text-2xl text-brand">{p.nome}</h1>
      <p className="mb-4 text-sm text-neutral-600">
        {p.supplierNome || "Fornecedor"} · lida por IA de <strong>{p.sourceFilename || "material"}</strong>
        {p.status !== "pending_admin" ? ` · status: ${p.status}` : ""}
      </p>

      {p.avisos.length > 0 ? (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h2 className="mb-1 text-sm font-semibold text-amber-900">Avisos da auditoria por IA</h2>
          <ul className="list-disc pl-5 text-sm text-amber-900">
            {p.avisos.map((a, i) => <li key={i}>{a}</li>)}
          </ul>
        </div>
      ) : null}

      <div className="mb-4 rounded-xl border border-neutral-200 bg-white p-4">
        <h2 className="mb-2 font-serif text-lg text-brand">O que a IA leu</h2>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <Item k="Nome" v={p.extracted?.nome} />
          <Item k="Tipo" v={p.extracted?.tipo} />
          <Item k="Valor" v={p.extracted?.valor != null ? String(p.extracted.valor) : null} />
          <Item k="Aplica a" v={p.extracted?.aplica_a} />
          <Item k="Alvo citado" v={p.extracted?.alvo_nome} />
          <Item k="Mínimo (semanas)" v={p.extracted?.min_quantidade != null ? String(p.extracted.min_quantidade) : null} />
          <Item k="Reservar de / até" v={[p.extracted?.reserva_de, p.extracted?.reserva_ate].filter(Boolean).join(" → ") || null} />
          <Item k="Viagem de / até" v={[p.extracted?.viagem_de, p.extracted?.viagem_ate].filter(Boolean).join(" → ") || null} />
        </dl>
        {p.extracted?.condicoes ? (
          <div className="mt-3 rounded-lg bg-neutral-50 p-3 text-xs text-neutral-700">
            <div className="mb-1 font-medium text-neutral-500">Condições (texto do documento)</div>
            <p className="whitespace-pre-wrap">{p.extracted.condicoes}</p>
          </div>
        ) : null}
      </div>

      {p.status === "pending_admin" ? (
        <PropostaPromocaoClient id={p.id} entrada={p.entrada} campi={campi.map((c) => ({ id: c.id, nome: c.nome }))} produtos={produtos} />
      ) : (
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-600">
          {p.status === "approved" && p.promotionId ? (
            <>
              Publicada como promoção. <Link href={`/admin/precos/promocoes/${p.promotionId}`} className="text-brand-golddark hover:underline">Abrir promoção →</Link>
            </>
          ) : p.status === "rejected" ? (
            <>Recusada{p.rejectReason ? `: ${p.rejectReason}` : ""}.</>
          ) : (
            <>Em processamento por outro admin. Se ficou presa, ela volta sozinha para a fila em alguns minutos — recarregue.</>
          )}
        </div>
      )}
    </div>
  );
}

function Item({ k, v }: { k: string; v: string | null | undefined }) {
  return (
    <div className="flex justify-between gap-3 border-b border-neutral-100 py-1">
      <dt className="text-neutral-500">{k}</dt>
      <dd className="text-right text-brand">{v || "—"}</dd>
    </div>
  );
}
