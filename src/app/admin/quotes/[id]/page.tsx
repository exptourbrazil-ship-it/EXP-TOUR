import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { exigirCapacidade } from "@/lib/admin-guard";
import { tenantIdAtual } from "@/lib/catalog-service";
import { materiaisParaCotacao } from "@/lib/material-service";
import { TIPO_MATERIAL_LABEL, type TipoMaterial } from "@/lib/material-helpers";
import ConstrutorClient, {
  type QuoteHeader,
  type OptionView,
  type ItemView,
} from "../ConstrutorClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Shell server do construtor de cotacao: carrega cotacao + opcoes + itens
// (escopo por tenant, service role) e entrega ao client interativo. As mutacoes
// (opcao/item/desconto/plano/recalculo) acontecem no client via /api/admin/...
export default async function AdminQuoteBuilderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await exigirCapacidade("propostas.gerir", "/admin/quotes");
  const { id } = await params;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );
  const tenantId = await tenantIdAtual(supabase);

  const { data: quote } = await supabase
    .from("quote")
    .select(
      "id, reference, status, source_currency, presentment_currency, public_token, token_revoked_at, valid_until, student:student_id(first_name, last_name)",
    )
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();
  if (!quote) notFound();

  const student = Array.isArray((quote as any).student)
    ? (quote as any).student[0]
    : (quote as any).student;
  const header: QuoteHeader = {
    id: quote.id,
    reference: quote.reference,
    status: quote.status,
    presentmentCurrency: quote.presentment_currency,
    studentName: student
      ? `${student.first_name ?? ""} ${student.last_name ?? ""}`.trim()
      : "(sem estudante)",
    publicToken: (quote as any).public_token ?? null,
    tokenRevoked: !!(quote as any).token_revoked_at,
    validUntil: (quote as any).valid_until ?? null,
  };

  const { data: optionRows } = await supabase
    .from("quote_option")
    .select("id, label, sort")
    .eq("tenant_id", tenantId)
    .eq("quote_id", id)
    .order("sort", { ascending: true });

  const options: OptionView[] = [];
  for (const opt of optionRows ?? []) {
    const { data: itemRows } = await supabase
      .from("quote_item")
      .select("id, group, quantity, unit, gross_amount, currency, product_snapshot, sort")
      .eq("tenant_id", tenantId)
      .eq("quote_option_id", opt.id)
      .order("sort", { ascending: true });

    const items: ItemView[] = (itemRows ?? []).map((it: any) => ({
      id: it.id,
      group: it.group,
      name: it.product_snapshot?.name ?? "(item)",
      quantity: Number(it.quantity),
      unit: it.unit,
      grossAmount: Number(it.gross_amount),
      currency: it.currency,
    }));

    options.push({ id: opt.id, label: opt.label, items });
  }

  // Materiais da escola para anexar à proposta (brochura certa, automático).
  const hoje = new Date().toISOString().slice(0, 10);
  const materiais = await materiaisParaCotacao(supabase, tenantId, id, hoje);

  return (
    <>
      <ConstrutorClient header={header} initialOptions={options} />
      {materiais.length > 0 ? (
        <div className="mx-auto mt-6 max-w-6xl">
          <div className="rounded-2xl border border-neutral-200 bg-white p-4">
            <h2 className="mb-1 font-serif text-lg text-brand">Materiais da escola para a proposta</h2>
            <p className="mb-3 text-sm text-neutral-500">
              Materiais que a escola liberou ao cliente (não vencidos). Anexe/compartilhe com a proposta.
            </p>
            <ul className="divide-y divide-neutral-100">
              {materiais.map((m) => (
                <li key={m.id} className="flex items-center justify-between py-2 text-sm">
                  <span>
                    <span className="font-medium text-brand">{m.titulo}</span>
                    <span className="ml-2 text-xs text-neutral-500">
                      {TIPO_MATERIAL_LABEL[m.tipo as TipoMaterial] || m.tipo}
                      {m.supplierNome ? ` · ${m.supplierNome}` : ""}
                    </span>
                  </span>
                  {m.temArquivo ? (
                    <a href={`/api/admin/materiais/${m.id}/download`} className="text-brand-golddark hover:underline">Baixar</a>
                  ) : m.linkUrl ? (
                    <a href={m.linkUrl} target="_blank" rel="noopener noreferrer" className="text-brand-golddark hover:underline">Abrir link</a>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </>
  );
}
