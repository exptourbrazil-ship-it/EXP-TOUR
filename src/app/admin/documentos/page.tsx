import { exigirCapacidade } from "@/lib/admin-guard";
import FilaDocumentos from "./FilaDocumentos";
import DocumentosAdminClient from "./DocumentosAdminClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Pagina protegida: exige sessao de admin (login em /admin/login). Antes esta
// tela pedia uma senha digitada (Bearer); agora usa a mesma sessao das demais
// telas admin. No topo, a fila de aprovacao (documentos pendentes de todos os
// titulares); abaixo, as ferramentas de enviar/buscar por CPF.
export default async function AdminDocumentosPage() {
  await exigirCapacidade("documentos.analisar", "/admin/documentos");
  return (
    <div className="mx-auto max-w-2xl">
      <FilaDocumentos />
      <hr className="my-8 border-neutral-200" />
      <DocumentosAdminClient />
    </div>
  );
}
