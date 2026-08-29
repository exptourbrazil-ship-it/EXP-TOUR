import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirFornecedor } from "@/lib/fornecedor-guard";
import { getServiceClient } from "@/lib/fornecedor-dados";
import { obterSubmissionDoFornecedor } from "@/lib/price-submission-service";
import PriceListEditor from "../PriceListEditor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function PriceListDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sessao = await exigirFornecedor(`/fornecedor/precos/${id}`);
  const supabase = getServiceClient();
  const sub = await obterSubmissionDoFornecedor(supabase, sessao.supplierId, id);
  if (!sub) notFound();

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <Link href="/fornecedor/precos" style={{ color: "var(--p-accent-ink)", fontSize: 13, textDecoration: "none" }}>
          ← Voltar para Preços
        </Link>
      </div>
      <h1 style={{ fontFamily: "var(--p-heading)", color: "var(--p-ink)", fontSize: 24, margin: "0 0 4px" }}>
        {sub.sourceFilename || "Price list"}
      </h1>
      <p style={{ color: "var(--p-muted)", fontSize: 13, margin: "0 0 16px" }}>
        {sub.extractStatus === "ok"
          ? "Rascunho extraído do PDF pela IA. Revise e corrija antes de aprovar."
          : sub.extractStatus === "sem_ia"
            ? "Extração automática indisponível — preencha os itens manualmente."
            : "Não foi possível ler o PDF automaticamente — preencha os itens manualmente."}
      </p>

      <PriceListEditor id={sub.id} status={sub.status} extracted={sub.extracted} />
    </div>
  );
}
