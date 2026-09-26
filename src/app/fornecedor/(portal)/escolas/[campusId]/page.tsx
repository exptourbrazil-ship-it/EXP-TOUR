import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirFornecedor } from "@/lib/fornecedor-guard";
import { getServiceClient } from "@/lib/fornecedor-dados";
import { listarCampiDoFornecedor } from "@/lib/campus-content-submission-service";
import { t } from "@/lib/fornecedor-i18n";
import ConteudoEscolaEditor from "./ConteudoEscolaEditor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Editor de conteúdo de uma escola. Confere posse (campus do supplier) e entrega
// ao editor client, que carrega/cria o rascunho via /api/fornecedor/campus-conteudo.
export default async function ConteudoEscolaPage({
  params,
}: {
  params: Promise<{ campusId: string }>;
}) {
  const sessao = await exigirFornecedor("/fornecedor/escolas");
  const { campusId } = await params;
  const supabase = getServiceClient();
  const campi = await listarCampiDoFornecedor(supabase, sessao.supplierId);
  const campus = campi.find((c) => c.id === campusId);
  if (!campus) notFound();

  const T = t(sessao.language, {
    pt: {
      voltar: "← Voltar às escolas",
      subtitulo: "Descreva a escola para a cotação. Salve o rascunho quando quiser e envie para a EXP Tour aprovar.",
    },
    en: {
      voltar: "← Back to schools",
      subtitulo: "Describe the school for the quote. Save the draft whenever you like and submit it for EXP Tour to approve.",
    },
  });

  return (
    <div>
      <div style={{ marginBottom: 8 }}>
        <Link href="/fornecedor/escolas" style={{ color: "var(--p-accent-ink)", textDecoration: "none", fontSize: 13 }}>
          {T.voltar}
        </Link>
      </div>
      <h1 style={{ fontFamily: "var(--p-heading)", color: "var(--p-ink)", fontSize: 24, margin: "0 0 4px" }}>{campus.name}</h1>
      <p style={{ color: "var(--p-ink)", opacity: 0.75, fontSize: 14, margin: "0 0 20px" }}>
        {T.subtitulo}
      </p>
      <ConteudoEscolaEditor campusId={campusId} idioma={sessao.language} />
    </div>
  );
}
