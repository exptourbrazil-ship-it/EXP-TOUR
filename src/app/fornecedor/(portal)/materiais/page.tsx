import { exigirFornecedor } from "@/lib/fornecedor-guard";
import { getServiceClient } from "@/lib/fornecedor-dados";
import { listarMateriaisDoFornecedor } from "@/lib/material-service";
import { t } from "@/lib/fornecedor-i18n";
import MateriaisClient from "./MateriaisClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Materiais do fornecedor (doc 06 §3.3): biblioteca que a escola mantém sozinha.
// Escopado ao supplier da sessão.
export default async function MateriaisPage() {
  const sessao = await exigirFornecedor("/fornecedor/materiais");
  const supabase = getServiceClient();
  const materiais = await listarMateriaisDoFornecedor(supabase, sessao.supplierId);

  const T = t(sessao.language, {
    pt: {
      titulo: "Materiais",
      descricao:
        "Sua biblioteca de materiais (brochuras, fotos, vídeos, mídia kit, logotipo, termos). Marque o que pode ser exposto ao cliente final. Arquivos em PDF/imagem; vídeos e outros formatos, por link.",
    },
    en: {
      titulo: "Materials",
      descricao:
        "Your materials library (brochures, photos, videos, media kit, logo, policies). Mark what can be shown to the end client. Files as PDF/image; videos and other formats via link.",
    },
  });

  return (
    <div>
      <h1 style={{ fontFamily: "var(--p-heading)", color: "var(--p-ink)", fontSize: 26, margin: "0 0 4px" }}>{T.titulo}</h1>
      <p style={{ color: "var(--p-ink)", opacity: 0.75, fontSize: 14, margin: "0 0 20px" }}>
        {T.descricao}
      </p>
      <MateriaisClient materiais={materiais} language={sessao.language} />
    </div>
  );
}
