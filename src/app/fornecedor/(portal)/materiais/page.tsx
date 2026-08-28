import { exigirFornecedor } from "@/lib/fornecedor-guard";
import { getServiceClient } from "@/lib/fornecedor-dados";
import { listarMateriaisDoFornecedor } from "@/lib/material-service";
import MateriaisClient from "./MateriaisClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Materiais do fornecedor (doc 06 §3.3): biblioteca que a escola mantém sozinha.
// Escopado ao supplier da sessão.
export default async function MateriaisPage() {
  const sessao = await exigirFornecedor("/fornecedor/materiais");
  const supabase = getServiceClient();
  const materiais = await listarMateriaisDoFornecedor(supabase, sessao.supplierId);

  return (
    <div>
      <h1 style={{ fontFamily: "Bellefair, serif", color: "#042f1b", fontSize: 26, margin: "0 0 4px" }}>Materiais</h1>
      <p style={{ color: "#042f1b", opacity: 0.75, fontSize: 14, margin: "0 0 20px" }}>
        Sua biblioteca de materiais (brochuras, fotos, vídeos, mídia kit, logotipo, termos). Marque o que pode
        ser exposto ao cliente final. Arquivos em PDF/imagem; vídeos e outros formatos, por link.
      </p>
      <MateriaisClient materiais={materiais} />
    </div>
  );
}
