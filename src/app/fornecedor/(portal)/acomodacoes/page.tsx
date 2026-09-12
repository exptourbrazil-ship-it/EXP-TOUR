import Link from "next/link";
import { exigirFornecedor } from "@/lib/fornecedor-guard";
import { getServiceClient } from "@/lib/fornecedor-dados";
import { listarProdutosDoFornecedor, listarConteudoDoFornecedor } from "@/lib/content-submission-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, { texto: string; cor: string }> = {
  draft: { texto: "Rascunho", cor: "var(--p-accent-ink)" },
  pending_admin: { texto: "Aguardando EXP Tour", cor: "#1d4ed8" },
  approved: { texto: "Publicado", cor: "var(--p-success-ink)" },
  rejected: { texto: "Devolvido", cor: "#b91c1c" },
};

// Conteúdo das acomodações (Fase B3): descrição, políticas, tipo de quarto/
// banheiro/refeições, distância e check-in/out — o que aparece na cotação.
export default async function AcomodacoesFornecedorPage() {
  const sessao = await exigirFornecedor("/fornecedor/acomodacoes");
  const supabase = getServiceClient();
  const [produtos, submissions] = await Promise.all([
    listarProdutosDoFornecedor(supabase, sessao.supplierId, "accommodation"),
    listarConteudoDoFornecedor(supabase, sessao.supplierId, "accommodation"),
  ]);
  const statusPorProduto = new Map<string, { status: string; rejectReason: string | null }>();
  for (const s of submissions) {
    if (!statusPorProduto.has(s.productId)) statusPorProduto.set(s.productId, { status: s.status, rejectReason: s.rejectReason });
  }

  return (
    <div>
      <h1 style={{ fontFamily: "var(--p-heading)", color: "var(--p-ink)", fontSize: 26, margin: "0 0 4px" }}>Conteúdo das acomodações</h1>
      <p style={{ color: "var(--p-ink)", opacity: 0.75, fontSize: 14, margin: "0 0 20px" }}>
        Descreva cada acomodação (descrição, políticas, tipo de quarto/banheiro/refeições, distância e
        check-in/out). Você edita um rascunho e envia; a EXP Tour aprova e publica.
      </p>

      {produtos.length === 0 ? (
        <p style={{ color: "var(--p-muted)", fontSize: 14 }}>Nenhuma acomodação cadastrada ainda.</p>
      ) : (
        <div style={{ border: "1px solid var(--p-line)", borderRadius: 12, background: "#fff", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--p-muted)", fontSize: 12 }}>
                <th style={{ padding: "10px 14px" }}>Acomodação</th>
                <th style={{ padding: "10px 14px" }}>Conteúdo</th>
                <th style={{ padding: "10px 14px" }}></th>
              </tr>
            </thead>
            <tbody>
              {produtos.map((p) => {
                const st = statusPorProduto.get(p.id);
                const badge = st ? STATUS_LABEL[st.status] : null;
                return (
                  <tr key={p.id} style={{ borderTop: "1px solid var(--p-line)", color: "var(--p-ink)" }}>
                    <td style={{ padding: "10px 14px" }}>{p.name}</td>
                    <td style={{ padding: "10px 14px", fontWeight: 600, color: badge ? badge.cor : "var(--p-muted)" }}>
                      {badge ? badge.texto : "Sem conteúdo"}
                      {st?.status === "rejected" && st.rejectReason ? (
                        <div style={{ fontWeight: 400, fontSize: 12, color: "var(--p-muted)" }}>{st.rejectReason}</div>
                      ) : null}
                    </td>
                    <td style={{ padding: "10px 14px", textAlign: "right" }}>
                      <Link href={`/fornecedor/acomodacoes/${p.id}`} style={{ color: "var(--p-accent-ink)", textDecoration: "none", fontSize: 13 }}>
                        {st?.status === "pending_admin" || st?.status === "approved" ? "Ver →" : "Editar conteúdo →"}
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
