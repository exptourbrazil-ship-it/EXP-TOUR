import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirFornecedor } from "@/lib/fornecedor-guard";
import { getServiceClient } from "@/lib/fornecedor-dados";
import { listarProdutosDoFornecedor } from "@/lib/content-submission-service";
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

  return (
    <div>
      <div style={{ marginBottom: 8 }}>
        <Link href="/fornecedor/acomodacoes" style={{ color: "var(--p-accent-ink)", textDecoration: "none", fontSize: 13 }}>
          ← Voltar às acomodações
        </Link>
      </div>
      <h1 style={{ fontFamily: "var(--p-heading)", color: "var(--p-ink)", fontSize: 24, margin: "0 0 4px" }}>{produto.name}</h1>
      <p style={{ color: "var(--p-ink)", opacity: 0.75, fontSize: 14, margin: "0 0 20px" }}>
        Descreva a acomodação para a cotação. Salve o rascunho quando quiser e envie para a EXP Tour aprovar.
      </p>
      <ConteudoAcomodacaoEditor productId={productId} />
    </div>
  );
}
