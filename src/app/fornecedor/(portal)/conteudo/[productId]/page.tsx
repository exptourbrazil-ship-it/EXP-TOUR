import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirFornecedor } from "@/lib/fornecedor-guard";
import { getServiceClient } from "@/lib/fornecedor-dados";
import { listarProgramas } from "@/lib/catalog-disponibilidade";
import { t } from "@/lib/fornecedor-i18n";
import ConteudoProgramaEditor from "./ConteudoProgramaEditor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Editor de conteúdo de um curso. Confere posse (programa do supplier) e entrega
// ao editor client, que carrega/cria o rascunho via /api/fornecedor/conteudo.
export default async function ConteudoProgramaPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const sessao = await exigirFornecedor("/fornecedor/conteudo");
  const { productId } = await params;
  const supabase = getServiceClient();
  const programas = await listarProgramas(supabase, sessao.supplierId);
  const programa = programas.find((p) => p.id === productId);
  if (!programa) notFound();

  const T = t(sessao.language, {
    pt: {
      voltar: "← Voltar aos cursos",
      subtitulo: "Descreva o curso para a cotação. Salve o rascunho quando quiser e envie para a EXP Tour aprovar.",
    },
    en: {
      voltar: "← Back to courses",
      subtitulo: "Describe the course for the quote. Save the draft whenever you like and submit it for EXP Tour to approve.",
    },
  });

  return (
    <div>
      <div style={{ marginBottom: 8 }}>
        <Link href="/fornecedor/conteudo" style={{ color: "var(--p-accent-ink)", textDecoration: "none", fontSize: 13 }}>
          {T.voltar}
        </Link>
      </div>
      <h1 style={{ fontFamily: "var(--p-heading)", color: "var(--p-ink)", fontSize: 24, margin: "0 0 4px" }}>{programa.name}</h1>
      <p style={{ color: "var(--p-ink)", opacity: 0.75, fontSize: 14, margin: "0 0 20px" }}>
        {T.subtitulo}
      </p>
      <ConteudoProgramaEditor productId={productId} idioma={sessao.language} />
    </div>
  );
}
