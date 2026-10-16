import { exigirFornecedor } from "@/lib/fornecedor-guard";
import { getServiceClient } from "@/lib/fornecedor-dados";
import { tenantIdAtual } from "@/lib/catalog-service";
import { listarFaturasDaEscola } from "@/lib/comissao-fatura-service";
import { papelFinanceiro } from "@/lib/fornecedor-faturas-api";
import { t } from "@/lib/fornecedor-i18n";
import FaturasClient from "./FaturasClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Faturas de comissao da EXP Tour para a escola (quando o aluno pagou direto a
// escola). Escopado ao supplier da sessao; so papeis financeiros veem (fatura e dado
// financeiro). A escola baixa o PDF e informa a previsao de pagamento; nao marca
// como paga (isso e do financeiro da EXP Tour).
export default async function FaturasPage() {
  const sessao = await exigirFornecedor("/fornecedor/faturas");
  const T = t(sessao.language, {
    pt: {
      titulo: "Faturas da EXP Tour",
      intro: "Comissões que a EXP Tour cobra da sua instituição quando o estudante paga o programa direto a vocês. Baixe o PDF, pague conforme as instruções e, se quiser, avise a data prevista.",
      semPermissao: "Esta área é restrita ao administrador e ao financeiro da instituição.",
    },
    en: {
      titulo: "EXP Tour invoices",
      intro: "Commissions EXP Tour invoices to your institution when the student pays the programme directly to you. Download the PDF, pay as instructed and, if you wish, tell us the expected payment date.",
      semPermissao: "This area is restricted to the institution's admin and finance users.",
    },
  });
  if (!papelFinanceiro(sessao.role)) {
    return (
      <div>
        <h1 style={{ fontFamily: "var(--p-heading)", color: "var(--p-ink)", fontSize: 26, margin: "0 0 4px" }}>{T.titulo}</h1>
        <p style={{ color: "var(--p-muted)", fontSize: 14 }}>{T.semPermissao}</p>
      </div>
    );
  }
  const supabase = getServiceClient();
  const tenantId = await tenantIdAtual(supabase);
  const faturas = await listarFaturasDaEscola(supabase, tenantId, sessao.supplierId);
  return (
    <div>
      <h1 style={{ fontFamily: "var(--p-heading)", color: "var(--p-ink)", fontSize: 26, margin: "0 0 4px" }}>{T.titulo}</h1>
      <p style={{ color: "var(--p-ink)", opacity: 0.75, fontSize: 14, margin: "0 0 20px", maxWidth: 760 }}>{T.intro}</p>
      <FaturasClient faturas={JSON.parse(JSON.stringify(faturas))} idioma={sessao.language} />
    </div>
  );
}
