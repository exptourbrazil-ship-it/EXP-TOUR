import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { exigirCapacidade } from "@/lib/admin-guard";
import { tenantIdAtual } from "@/lib/catalog-service";
import { listarProdutosDoFornecedor } from "@/lib/fornecedor-hub-service";
import ProdutosDoTipoClient from "./ProdutosDoTipoClient";

// Corpo compartilhado das abas por tipo de produto (Programas/Acomodação/Outros/
// Pacotes/Seguro) no estilo Edvisor. Cada page.tsx chama este helper com o kind
// e os rótulos. Escopo tenant + supplier no serviço.
export async function PaginaProdutosDoTipo({
  supplierId,
  kind,
  titulo,
  vazio,
}: {
  supplierId: string;
  kind: string;
  titulo: string;
  vazio: string;
}) {
  await exigirCapacidade("fornecedores.gerir", "/admin/fornecedores");
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );
  const tenantId = await tenantIdAtual(supabase);
  const produtos = await listarProdutosDoFornecedor(supabase, tenantId, supplierId, { kind });

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-serif text-lg text-brand">{titulo}</h2>
        <Link href="/admin/produtos/novo" className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-brand-cream">
          + Novo
        </Link>
      </div>
      <ProdutosDoTipoClient produtos={produtos} vazioLabel={vazio} />
    </div>
  );
}
