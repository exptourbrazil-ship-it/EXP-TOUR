import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirFornecedor } from "@/lib/fornecedor-guard";
import { getServiceClient } from "@/lib/fornecedor-dados";
import { obterSubmissionDoFornecedor } from "@/lib/price-submission-service";
import { t } from "@/lib/fornecedor-i18n";
import PriceListEditor from "../PriceListEditor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function PriceListDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sessao = await exigirFornecedor(`/fornecedor/precos/${id}`);
  const supabase = getServiceClient();
  const sub = await obterSubmissionDoFornecedor(supabase, sessao.supplierId, id);
  if (!sub) notFound();

  const T = t(sessao.language, {
    pt: {
      voltar: "← Voltar para Preços",
      tituloFallback: "Price list",
      extraidoOk: "Rascunho extraído do PDF pela IA. Revise e corrija antes de aprovar.",
      semIa: "Extração automática indisponível — preencha os itens manualmente.",
      falhaExtracao: "Não foi possível ler o PDF automaticamente — preencha os itens manualmente.",
      manual: "Tabela em branco — adicione os programas, acomodações e taxas.",
    },
    en: {
      voltar: "← Back to Pricing",
      tituloFallback: "Price list",
      extraidoOk: "Draft extracted from the PDF by AI. Review and correct it before approving.",
      semIa: "Automatic extraction unavailable — fill in the items manually.",
      falhaExtracao: "Could not read the PDF automatically — fill in the items manually.",
      manual: "Blank table — add the programs, accommodations and fees.",
    },
  });

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <Link href="/fornecedor/precos" style={{ color: "var(--p-accent-ink)", fontSize: 13, textDecoration: "none" }}>
          {T.voltar}
        </Link>
      </div>
      <h1 style={{ fontFamily: "var(--p-heading)", color: "var(--p-ink)", fontSize: 24, margin: "0 0 4px" }}>
        {sub.sourceFilename || T.tituloFallback}
      </h1>
      <p style={{ color: "var(--p-muted)", fontSize: 13, margin: "0 0 16px" }}>
        {sub.extractStatus === "ok"
          ? T.extraidoOk
          : sub.extractStatus === "sem_ia"
            ? T.semIa
            : sub.extractStatus === "manual"
              ? T.manual
              : T.falhaExtracao}
      </p>

      <PriceListEditor id={sub.id} status={sub.status} extracted={sub.extracted} language={sessao.language} />
    </div>
  );
}
