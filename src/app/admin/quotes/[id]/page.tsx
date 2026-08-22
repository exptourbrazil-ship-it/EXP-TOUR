import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { exigirCapacidade } from "@/lib/admin-guard";
import { tenantIdAtual } from "@/lib/catalog-service";
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

  return <ConstrutorClient header={header} initialOptions={options} />;
}
