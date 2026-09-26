import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirFornecedor } from "@/lib/fornecedor-guard";
import { getServiceClient } from "@/lib/fornecedor-dados";
import { tenantIdAtual } from "@/lib/catalog-service";
import { obterPropostaPromocao } from "@/lib/promocao-proposta-service";
import { listarCampiDoFornecedor } from "@/lib/campus-content-submission-service";
import { listarProgramas } from "@/lib/catalog-disponibilidade";
import { listarTaxasAdmin } from "@/lib/fee-admin-service";
import { t, statusConteudoLabel } from "@/lib/fornecedor-i18n";
import PromocaoFornecedorForm from "../PromocaoFornecedorForm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Detalhe/edição de UMA proposta de promoção da escola. Posse: a proposta tem
// que ser deste supplier_id — notFound caso contrário (nunca vaza proposta de
// outra escola). Editável apenas enquanto pending_admin (ver
// PromocaoFornecedorForm/atualizarPropostaFornecedor).
export default async function PromocaoFornecedorDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sessao = await exigirFornecedor(`/fornecedor/precos/promocoes/${id}`);
  const supabase = getServiceClient();
  const tenantId = await tenantIdAtual(supabase);
  const proposta = await obterPropostaPromocao(supabase, tenantId, id);
  if (!proposta || proposta.supplierId !== sessao.supplierId) notFound();

  const [campi, programas, taxas] = await Promise.all([
    listarCampiDoFornecedor(supabase, sessao.supplierId),
    listarProgramas(supabase, sessao.supplierId),
    listarTaxasAdmin(supabase, tenantId),
  ]);
  const campusIds = new Set(campi.map((c) => c.id));
  const taxasDoFornecedor = taxas.filter((f) => f.campusId && campusIds.has(f.campusId));

  const T = t(sessao.language, {
    pt: { voltar: "← Voltar para Promoções", motivo: "Motivo da recusa:" },
    en: { voltar: "← Back to Promotions", motivo: "Rejection reason:" },
  });
  const { texto: statusTexto, cor: statusCor } = statusConteudoLabel(sessao.language, proposta.status);

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <Link href="/fornecedor/precos/promocoes" style={{ color: "var(--p-accent-ink)", fontSize: 13, textDecoration: "none" }}>
          {T.voltar}
        </Link>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 4 }}>
        <h1 style={{ fontFamily: "var(--p-heading)", color: "var(--p-ink)", fontSize: 24, margin: 0 }}>{proposta.nome}</h1>
        <span style={{ color: statusCor, fontWeight: 600, fontSize: 13 }}>{statusTexto}</span>
      </div>

      {proposta.status === "rejected" && proposta.rejectReason ? (
        <p style={{ margin: "8px 0 16px", fontSize: 13, color: "#b91c1c" }}>
          <strong>{T.motivo}</strong> {proposta.rejectReason}
        </p>
      ) : (
        <div style={{ marginBottom: 16 }} />
      )}

      <PromocaoFornecedorForm
        id={proposta.id}
        status={proposta.status}
        entradaInicial={proposta.entrada}
        campi={campi.map((c) => ({ id: c.id, nome: c.name }))}
        produtos={programas.map((p) => ({ id: p.id, nome: p.name }))}
        fees={taxasDoFornecedor.map((f) => ({ id: f.id, nome: f.name }))}
        language={sessao.language}
      />
    </div>
  );
}
