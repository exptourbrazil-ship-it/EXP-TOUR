import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirFornecedor } from "@/lib/fornecedor-guard";
import { getServiceClient } from "@/lib/fornecedor-dados";
import { listarProdutosDoFornecedor } from "@/lib/content-submission-service";
import { t } from "@/lib/fornecedor-i18n";
import ConteudoAcomodacaoEditor from "./ConteudoAcomodacaoEditor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Editor de conteúdo de uma acomodação. Confere posse (produto accommodation do
// supplier) e entrega ao editor client, que usa /api/fornecedor/conteudo (kind).
export default async function ConteudoAcomodacaoPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const sessao = await exigirFornecedor("/fornecedor/acomodacoes");
  const { productId } = await params;
  const supabase = getServiceClient();
  const produtos = await listarProdutosDoFornecedor(supabase, sessao.supplierId, "accommodation");
  const produto = produtos.find((p) => p.id === productId);
  if (!produto) notFound();

  const T = t(sessao.language, {
    pt: {
      voltar: "← Voltar às acomodações",
      subtitulo: "Descreva a acomodação para a cotação. Salve o rascunho quando quiser e envie para a EXP Tour aprovar.",
    },
    en: {
      voltar: "← Back to accommodation",
      subtitulo: "Describe the accommodation for the quote. Save the draft whenever you like and submit it for EXP Tour to approve.",
    },
  });

  return (
    <div>
      <div style={{ marginBottom: 8 }}>
        <Link href="/fornecedor/acomodacoes" style={{ color: "var(--p-accent-ink)", textDecoration: "none", fontSize: 13 }}>
          {T.voltar}
        </Link>
      </div>
      <h1 style={{ fontFamily: "var(--p-heading)", color: "var(--p-ink)", fontSize: 24, margin: "0 0 4px" }}>{produto.name}</h1>
      <p style={{ color: "var(--p-ink)", opacity: 0.75, fontSize: 14, margin: "0 0 20px" }}>
        {T.subtitulo}
      </p>
      <ConteudoAcomodacaoEditor productId={productId} idioma={sessao.language} />
    </div>
  );
}
