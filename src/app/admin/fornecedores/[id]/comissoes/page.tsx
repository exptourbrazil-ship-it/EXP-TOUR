import { createClient } from "@supabase/supabase-js";
import { notFound } from "next/navigation";
import { exigirCapacidade } from "@/lib/admin-guard";
import { podeAdmin } from "@/lib/admin-roles";
import { tenantIdAtual } from "@/lib/catalog-service";
import { carregarFornecedorDoTenant } from "@/lib/fornecedor-hub-service";
import { carregarRegrasDaEscola, listarProdutosDaEscola } from "@/lib/comissao-fatura-service";
import ComissoesClient from "./ComissoesClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Aba "Comissões" do hub: acordo padrão da escola + regras por tipo de item e por
// produto/programa/serviço (a regra mais específica vale). Leitura: financeiro.ver;
// gravar: financeiro.gerir (revalidado na rota — a UI só espelha a matriz).
export default async function ComissoesDaEscolaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { papel } = await exigirCapacidade("financeiro.ver", "/admin/fornecedores");
  const podeGerir = podeAdmin(papel, "financeiro.gerir");
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string);
  const tenantId = await tenantIdAtual(supabase);
  const fornecedor = await carregarFornecedorDoTenant(supabase, tenantId, id);
  if (!fornecedor) notFound();
  const [r, produtos] = await Promise.all([carregarRegrasDaEscola(supabase, tenantId, id), listarProdutosDaEscola(supabase, tenantId, id)]);
  return (
    <ComissoesClient
      supplierId={id}
      padrao={r.padrao}
      regras={JSON.parse(JSON.stringify(r.regras))}
      produtos={produtos}
      podeGerir={podeGerir}
    />
  );
}
