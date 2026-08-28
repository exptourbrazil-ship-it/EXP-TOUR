import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { exigirCapacidade } from "@/lib/admin-guard";
import { obterDetalheAdmin } from "@/lib/price-admin-service";
import { tenantIdAtual } from "@/lib/catalog-service";
import PrecoAprovacaoClient from "./PrecoAprovacaoClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fmtFaixas(tiers: { minQuantity: number; unitPrice: number }[], unit: string, moeda: string | null): string {
  if (tiers.length === 0) return "—";
  return tiers.map((t) => `≥${t.minQuantity} ${unit}: ${moeda || ""} ${t.unitPrice}`).join(" · ");
}

export default async function AdminPrecoDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await exigirCapacidade("fornecedores.gerir", `/admin/precos/${id}`);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const tenantId = await tenantIdAtual(supabase);
  const sub = await obterDetalheAdmin(supabase, tenantId, id);
  if (!sub) notFound();

  const e = sub.extracted;
  const moeda = sub.currency;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-3">
        <Link href="/admin/precos" className="text-sm text-neutral-500 hover:text-brand">← Fila de aprovação</Link>
      </div>
      <h1 className="mb-1 font-serif text-2xl text-brand">{sub.supplierNome || "Price list"}</h1>
      <p className="mb-4 text-sm text-neutral-600">
        {sub.sourceFilename || "—"} · {sub.itens} itens · moeda {moeda || "—"}
        {sub.status !== "pending_admin" ? ` · status: ${sub.status}` : ""}
      </p>

      {e.programs.length > 0 ? (
        <Secao titulo="Programas">
          {e.programs.map((p, i) => (
            <Linha key={`p${i}`} nome={p.name} detalhe={fmtFaixas(p.tiers, p.unit, moeda)} />
          ))}
        </Secao>
      ) : null}
      {e.accommodations.length > 0 ? (
        <Secao titulo="Acomodações">
          {e.accommodations.map((a, i) => (
            <Linha key={`a${i}`} nome={`${a.name}${a.type ? ` (${a.type})` : ""}`} detalhe={fmtFaixas(a.tiers, a.unit, moeda)} />
          ))}
        </Secao>
      ) : null}
      {e.fees.length > 0 ? (
        <Secao titulo="Taxas">
          {e.fees.map((f, i) => (
            <Linha key={`f${i}`} nome={f.name} detalhe={`${moeda || ""} ${f.amount}${f.feeType ? ` · ${f.feeType}` : ""}`} />
          ))}
        </Secao>
      ) : null}

      {sub.status === "pending_admin" ? (
        <PrecoAprovacaoClient id={sub.id} />
      ) : (
        <p className="mt-4 rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-600">
          Este price list já foi {sub.status === "approved" ? "aprovado e publicado" : "processado"} — somente leitura.
        </p>
      )}
    </div>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="mb-4 rounded-xl border border-neutral-200 bg-white p-4">
      <h2 className="mb-2 font-serif text-lg text-brand">{titulo}</h2>
      <ul className="divide-y divide-neutral-100">{children}</ul>
    </div>
  );
}
function Linha({ nome, detalhe }: { nome: string; detalhe: string }) {
  return (
    <li className="py-2 text-sm">
      <div className="font-medium text-brand">{nome}</div>
      <div className="text-neutral-500 text-xs">{detalhe}</div>
    </li>
  );
}
