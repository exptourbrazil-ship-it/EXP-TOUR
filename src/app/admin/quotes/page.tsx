import { createClient } from "@supabase/supabase-js";
import { exigirCapacidade } from "@/lib/admin-guard";
import { tenantIdAtual } from "@/lib/catalog-service";
import QuotesListClient, { type QuoteRow } from "./QuotesListClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Pagina admin: lista de cotacoes do tenant + criacao (quick-create de estudante
// + cotacao). O construtor por cotacao fica em /admin/quotes/[id]. Escopo por
// tenant e leitura server-side (service role); a autorizacao e por capacidade.
export default async function AdminQuotesPage() {
  await exigirCapacidade("propostas.gerir", "/admin/quotes");

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );
  const tenantId = await tenantIdAtual(supabase);

  const { data } = await supabase
    .from("quote")
    .select("id, reference, status, created_at, student:student_id(first_name, last_name)")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(200);

  const ids = (data ?? []).map((q: any) => q.id);

  // "Opcao-chave" por cotacao: a recomendada, senao a de menor sort. Com o
  // subtotal BRUTO dos itens dela (os totais nao sao armazenados; e uma
  // magnitude para triagem na lista, nao o preco final liquido).
  const opcoesPorCotacao = new Map<string, { id: string; label: string; recomendada: boolean; sort: number }[]>();
  const brutoPorOpcao = new Map<string, { total: number; currency: string }>();
  if (ids.length > 0) {
    const { data: opts } = await supabase
      .from("quote_option")
      .select("id, quote_id, label, is_recommended, sort")
      .eq("tenant_id", tenantId)
      .in("quote_id", ids);
    for (const o of opts ?? []) {
      const arr = opcoesPorCotacao.get(o.quote_id) ?? [];
      arr.push({ id: o.id, label: o.label ?? "Opção", recomendada: !!o.is_recommended, sort: o.sort ?? 0 });
      opcoesPorCotacao.set(o.quote_id, arr);
    }
    const optionIds = (opts ?? []).map((o: any) => o.id);
    if (optionIds.length > 0) {
      const { data: items } = await supabase
        .from("quote_item")
        .select("quote_option_id, gross_amount, currency")
        .eq("tenant_id", tenantId)
        .in("quote_option_id", optionIds);
      for (const it of items ?? []) {
        const atual = brutoPorOpcao.get(it.quote_option_id) ?? { total: 0, currency: it.currency ?? "BRL" };
        atual.total += Number(it.gross_amount ?? 0);
        atual.currency = it.currency ?? atual.currency;
        brutoPorOpcao.set(it.quote_option_id, atual);
      }
    }
  }

  function opcaoChave(quoteId: string) {
    const arr = opcoesPorCotacao.get(quoteId) ?? [];
    if (arr.length === 0) return null;
    const principal = arr.find((o) => o.recomendada) ?? [...arr].sort((a, b) => a.sort - b.sort)[0];
    const g = brutoPorOpcao.get(principal.id);
    return {
      label: principal.label,
      total: g ? Math.round(g.total * 100) / 100 : null,
      currency: g?.currency ?? null,
    };
  }

  const quotes: QuoteRow[] = (data ?? []).map((q: any) => {
    const s = Array.isArray(q.student) ? q.student[0] : q.student;
    const nome = s ? `${s.first_name ?? ""} ${s.last_name ?? ""}`.trim() : "";
    const chave = opcaoChave(q.id);
    return {
      id: q.id,
      reference: q.reference,
      status: q.status,
      createdAt: q.created_at,
      studentName: nome || "(sem estudante)",
      mainOptionLabel: chave?.label ?? null,
      mainOptionTotal: chave?.total ?? null,
      mainOptionCurrency: chave?.currency ?? null,
    };
  });

  return <QuotesListClient quotes={quotes} />;
}
