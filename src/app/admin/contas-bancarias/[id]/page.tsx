import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { exigirCapacidade } from "@/lib/admin-guard";
import { tenantIdAtual } from "@/lib/catalog-service";
import { obterContaBancaria, listarContasBancariasFornecedor } from "@/lib/supplier-bank-service";
import ContaBancariaAdminClient from "./ContaBancariaAdminClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fmtData(iso: string | null): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

function Item({ k, v }: { k: string; v: string | null | undefined }) {
  return (
    <div className="flex justify-between gap-3 border-b border-neutral-100 py-1">
      <dt className="text-neutral-500">{k}</dt>
      <dd className="text-right text-brand">{v || "—"}</dd>
    </div>
  );
}

// Revisão de UMA proposta de conta bancária (destino do repasse). Mostra os
// dados propostos lado a lado com a conta CONFIRMADA atual (se houver), para o
// admin comparar antes de decidir — trocar de conta é o momento de maior risco
// (redirecionar repasse fraudulentamente). Capacidade financeiro.ver para abrir;
// confirmar/rejeitar exige financeiro.gerir (checado na rota da API).
export default async function ContaBancariaAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await exigirCapacidade("financeiro.ver", `/admin/contas-bancarias/${id}`);
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string);
  const tenantId = await tenantIdAtual(supabase);
  const proposta = await obterContaBancaria(supabase, tenantId, id);
  if (!proposta) notFound();

  const historico = await listarContasBancariasFornecedor(supabase, tenantId, proposta.supplierId);
  const confirmadaAtual = historico.find((c) => c.status === "confirmed" && c.id !== proposta.id) ?? null;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-3 flex flex-wrap gap-3 text-sm text-neutral-500">
        <Link href="/admin/contas-bancarias" className="hover:text-brand">← Contas bancárias</Link>
        <Link href={`/admin/fornecedores/${proposta.supplierId}`} className="hover:text-brand">Fornecedor →</Link>
      </div>
      <h1 className="mb-1 font-serif text-2xl text-brand">{proposta.supplierNome || "Fornecedor"}</h1>
      <p className="mb-4 text-sm text-neutral-600">
        Proposta enviada por <strong>{proposta.proposedBy}</strong> em {fmtData(proposta.createdAt)}
        {proposta.status !== "pending_admin" ? ` · status: ${proposta.status}` : ""}
      </p>

      {confirmadaAtual ? (
        <div className="mb-4 rounded-xl border border-neutral-200 bg-neutral-50 p-4">
          <h2 className="mb-2 text-sm font-semibold text-neutral-700">Conta confirmada atualmente (será substituída)</h2>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            <Item k="Titular" v={confirmadaAtual.accountHolderName} />
            <Item k="Banco" v={confirmadaAtual.bankName} />
            <Item k="País / moeda" v={[confirmadaAtual.countryCode, confirmadaAtual.currency].filter(Boolean).join(" · ")} />
            <Item k="IBAN" v={confirmadaAtual.iban} />
            <Item k="SWIFT/BIC" v={confirmadaAtual.swiftBic} />
            <Item k="Conta" v={confirmadaAtual.accountNumber} />
            <Item k="Agência / routing" v={confirmadaAtual.routingCode} />
            <Item k="Chave Pix" v={confirmadaAtual.pixKey} />
            <Item k="Confirmada em" v={fmtData(confirmadaAtual.reviewedAt)} />
          </dl>
        </div>
      ) : (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Este fornecedor ainda não tem nenhuma conta confirmada — esta seria a primeira.
        </div>
      )}

      <div className="mb-4 rounded-xl border border-neutral-200 bg-white p-4">
        <h2 className="mb-2 font-serif text-lg text-brand">Proposta do fornecedor</h2>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <Item k="Titular" v={proposta.accountHolderName} />
          <Item k="Banco" v={proposta.bankName} />
          <Item k="País / moeda" v={[proposta.countryCode, proposta.currency].filter(Boolean).join(" · ")} />
          <Item k="IBAN" v={proposta.iban} />
          <Item k="SWIFT/BIC" v={proposta.swiftBic} />
          <Item k="Conta" v={proposta.accountNumber} />
          <Item k="Agência / routing" v={proposta.routingCode} />
          <Item k="Chave Pix" v={proposta.pixKey} />
        </dl>
        {proposta.notes ? (
          <div className="mt-3 rounded-lg bg-neutral-50 p-3 text-xs text-neutral-700">
            <div className="mb-1 font-medium text-neutral-500">Observação do fornecedor</div>
            <p className="whitespace-pre-wrap">{proposta.notes}</p>
          </div>
        ) : null}
      </div>

      {proposta.status === "pending_admin" ? (
        <ContaBancariaAdminClient id={proposta.id} supplierId={proposta.supplierId} />
      ) : (
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-600">
          {proposta.status === "confirmed" ? (
            <>Confirmada por {proposta.reviewedBy || "—"} em {fmtData(proposta.reviewedAt)}.</>
          ) : proposta.status === "rejected" ? (
            <>Recusada por {proposta.reviewedBy || "—"}{proposta.rejectionReason ? `: ${proposta.rejectionReason}` : ""}.</>
          ) : (
            <>Substituída por uma confirmação mais recente.</>
          )}
        </div>
      )}
    </div>
  );
}
