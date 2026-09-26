import Link from "next/link";
import { exigirFornecedor } from "@/lib/fornecedor-guard";
import { getServiceClient } from "@/lib/fornecedor-dados";
import { tenantIdAtual } from "@/lib/catalog-service";
import { listarCampiDoFornecedor } from "@/lib/campus-content-submission-service";
import { listarProgramas } from "@/lib/catalog-disponibilidade";
import { listarTaxasAdmin } from "@/lib/fee-admin-service";
import { t } from "@/lib/fornecedor-i18n";
import PromocaoFornecedorForm from "../PromocaoFornecedorForm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Nova proposta de promoção. Campi/cursos/taxas listados são SEMPRE só os
// deste fornecedor (defesa em profundidade — a posse real é reconferida no
// servidor em aprovarPropostaPromocao, via salvarPromocao).
export default async function NovaPromocaoFornecedorPage() {
  const sessao = await exigirFornecedor("/fornecedor/precos/promocoes/nova");
  const supabase = getServiceClient();
  const tenantId = await tenantIdAtual(supabase);
  const [campi, programas, taxas] = await Promise.all([
    listarCampiDoFornecedor(supabase, sessao.supplierId),
    listarProgramas(supabase, sessao.supplierId),
    listarTaxasAdmin(supabase, tenantId),
  ]);
  const campusIds = new Set(campi.map((c) => c.id));
  const taxasDoFornecedor = taxas.filter((f) => f.campusId && campusIds.has(f.campusId));

  const T = t(sessao.language, {
    pt: { voltar: "← Voltar para Promoções", titulo: "Nova promoção" },
    en: { voltar: "← Back to Promotions", titulo: "New promotion" },
  });

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <Link href="/fornecedor/precos/promocoes" style={{ color: "var(--p-accent-ink)", fontSize: 13, textDecoration: "none" }}>
          {T.voltar}
        </Link>
      </div>
      <h1 style={{ fontFamily: "var(--p-heading)", color: "var(--p-ink)", fontSize: 24, margin: "0 0 16px" }}>{T.titulo}</h1>

      <PromocaoFornecedorForm
        campi={campi.map((c) => ({ id: c.id, nome: c.name }))}
        produtos={programas.map((p) => ({ id: p.id, nome: p.name }))}
        fees={taxasDoFornecedor.map((f) => ({ id: f.id, nome: f.name }))}
        language={sessao.language}
      />
    </div>
  );
}
