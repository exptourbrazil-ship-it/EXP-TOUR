import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirFornecedor } from "@/lib/fornecedor-guard";
import { getServiceClient } from "@/lib/fornecedor-dados";
import { listarCampiDoFornecedor } from "@/lib/campus-content-submission-service";
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

  return (
    <div>
      <div style={{ marginBottom: 8 }}>
        <Link href="/fornecedor/escolas" style={{ color: "var(--p-accent-ink)", textDecoration: "none", fontSize: 13 }}>
          ← Voltar às escolas
        </Link>
      </div>
      <h1 style={{ fontFamily: "var(--p-heading)", color: "var(--p-ink)", fontSize: 24, margin: "0 0 4px" }}>{campus.name}</h1>
      <p style={{ color: "var(--p-ink)", opacity: 0.75, fontSize: 14, margin: "0 0 20px" }}>
        Descreva a escola para a cotação. Salve o rascunho quando quiser e envie para a EXP Tour aprovar.
      </p>
      <ConteudoEscolaEditor campusId={campusId} />
    </div>
  );
}
