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

  const quotes: QuoteRow[] = (data ?? []).map((q: any) => {
    const s = Array.isArray(q.student) ? q.student[0] : q.student;
    const nome = s ? `${s.first_name ?? ""} ${s.last_name ?? ""}`.trim() : "";
    return {
      id: q.id,
      reference: q.reference,
      status: q.status,
      createdAt: q.created_at,
      studentName: nome || "(sem estudante)",
    };
  });

  return <QuotesListClient quotes={quotes} />;
}
