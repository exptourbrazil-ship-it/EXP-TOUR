import Link from "next/link";
import { exigirFornecedor } from "@/lib/fornecedor-guard";
import { getServiceClient } from "@/lib/fornecedor-dados";
import { tenantIdAtual } from "@/lib/catalog-service";
import { listarPropostasPromocao } from "@/lib/promocao-proposta-service";
import { t, statusConteudoLabel } from "@/lib/fornecedor-i18n";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIPO_LABEL: Record<string, { pt: string; en: string }> = {
  percent_off: { pt: "Desconto %", en: "Percent off" },
  fixed_off: { pt: "Desconto fixo", en: "Fixed off" },
  free_units: { pt: "Unidades grátis", en: "Free units" },
  waive_fee: { pt: "Isentar taxa", en: "Waive fee" },
  free_product: { pt: "Produto grátis", en: "Free product" },
  override_price: { pt: "Preço promocional", en: "Promotional price" },
};

// Propostas de promoção da escola (criação manual, sem material/IA): entram na
// MESMA fila de revisão do admin. Escopado ao supplier da sessão.
export default async function PromocoesFornecedorPage() {
  const sessao = await exigirFornecedor("/fornecedor/precos/promocoes");
  const supabase = getServiceClient();
  const tenantId = await tenantIdAtual(supabase);
  const propostas = await listarPropostasPromocao(supabase, tenantId, { supplierId: sessao.supplierId });

  const T = t(sessao.language, {
    pt: {
      voltar: "← Voltar para Preços",
      titulo: "Promoções",
      intro: "Proponha uma promoção (desconto, semanas grátis, isenção de taxa…) para seus cursos ou acomodações. A EXP Tour revisa e publica.",
      nova: "+ Nova promoção",
      nenhuma: "Nenhuma promoção proposta ainda.",
      nome: "Nome",
      tipo: "Tipo",
      status: "Status",
      ver: "Ver →",
      editar: "Editar →",
    },
    en: {
      voltar: "← Back to Pricing",
      titulo: "Promotions",
      intro: "Propose a promotion (discount, free weeks, fee waiver…) for your courses or accommodation. EXP Tour reviews and publishes it.",
      nova: "+ New promotion",
      nenhuma: "No promotion proposed yet.",
      nome: "Name",
      tipo: "Type",
      status: "Status",
      ver: "View →",
      editar: "Edit →",
    },
  });

  const lang = sessao.language === "pt" ? "pt" : "en";

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <Link href="/fornecedor/precos" style={{ color: "var(--p-accent-ink)", fontSize: 13, textDecoration: "none" }}>
          {T.voltar}
        </Link>
      </div>
      <h1 style={{ fontFamily: "var(--p-heading)", color: "var(--p-ink)", fontSize: 26, margin: "0 0 4px" }}>{T.titulo}</h1>
      <p style={{ color: "var(--p-ink)", opacity: 0.75, fontSize: 14, margin: "0 0 20px", maxWidth: "70ch" }}>{T.intro}</p>

      <Link
        href="/fornecedor/precos/promocoes/nova"
        style={{
          display: "inline-block",
          background: "#fff",
          color: "var(--p-accent-ink)",
          border: "1px solid var(--p-line)",
          borderRadius: 8,
          padding: "8px 14px",
          fontSize: 13,
          fontWeight: 600,
          textDecoration: "none",
          marginBottom: 20,
        }}
      >
        {T.nova}
      </Link>

      {propostas.length === 0 ? (
        <p style={{ color: "var(--p-muted)", fontSize: 14 }}>{T.nenhuma}</p>
      ) : (
        <div style={{ border: "1px solid var(--p-line)", borderRadius: 12, background: "#fff", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--p-muted)", fontSize: 12 }}>
                <th style={{ padding: "10px 14px" }}>{T.nome}</th>
                <th style={{ padding: "10px 14px" }}>{T.tipo}</th>
                <th style={{ padding: "10px 14px" }}>{T.status}</th>
                <th style={{ padding: "10px 14px" }}></th>
              </tr>
            </thead>
            <tbody>
              {propostas.map((p) => {
                const { texto, cor } = statusConteudoLabel(sessao.language, p.status);
                const tipoTexto = p.tipo ? TIPO_LABEL[p.tipo]?.[lang] ?? p.tipo : "—";
                return (
                  <tr key={p.id} style={{ borderTop: "1px solid var(--p-line)", color: "var(--p-ink)" }}>
                    <td style={{ padding: "10px 14px" }}>{p.nome}</td>
                    <td style={{ padding: "10px 14px" }}>{tipoTexto}</td>
                    <td style={{ padding: "10px 14px", color: cor, fontWeight: 600 }}>{texto}</td>
                    <td style={{ padding: "10px 14px", textAlign: "right" }}>
                      <Link href={`/fornecedor/precos/promocoes/${p.id}`} style={{ color: "var(--p-accent-ink)", textDecoration: "none", fontSize: 13 }}>
                        {p.status === "pending_admin" ? T.editar : T.ver}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
