import Link from "next/link";
import { exigirFornecedor } from "@/lib/fornecedor-guard";
import { getServiceClient } from "@/lib/fornecedor-dados";
import { listarProdutosDoFornecedor, listarConteudoDoFornecedor } from "@/lib/content-submission-service";
import { t, statusConteudoLabel } from "@/lib/fornecedor-i18n";
import NovaAcomodacaoForm from "./NovaAcomodacaoForm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  const T = t(sessao.language, {
    pt: {
      titulo: "Conteúdo das acomodações",
      subtitulo:
        "Descreva cada acomodação (descrição, políticas, tipo de quarto/banheiro/refeições, distância e check-in/out). Você edita um rascunho e envia; a EXP Tour aprova e publica.",
      nenhumaAcomodacao: "Nenhuma acomodação cadastrada ainda.",
      acomodacao: "Acomodação",
      conteudo: "Conteúdo",
      semConteudo: "Sem conteúdo",
      ver: "Ver →",
      editarConteudo: "Editar conteúdo →",
    },
    en: {
      titulo: "Accommodation content",
      subtitulo:
        "Describe each accommodation (description, policies, room/bathroom/meal type, distance and check-in/out). Edit a draft and submit it; EXP Tour approves and publishes it.",
      nenhumaAcomodacao: "No accommodation registered yet.",
      acomodacao: "Accommodation",
      conteudo: "Content",
      semConteudo: "No content",
      ver: "View →",
      editarConteudo: "Edit content →",
    },
  });

  return (
    <div>
      <h1 style={{ fontFamily: "var(--p-heading)", color: "var(--p-ink)", fontSize: 26, margin: "0 0 4px" }}>{T.titulo}</h1>
      <p style={{ color: "var(--p-ink)", opacity: 0.75, fontSize: 14, margin: "0 0 20px" }}>
        {T.subtitulo}
      </p>

      <NovaAcomodacaoForm idioma={sessao.language} />

      {produtos.length === 0 ? (
        <p style={{ color: "var(--p-muted)", fontSize: 14 }}>{T.nenhumaAcomodacao}</p>
      ) : (
        <div style={{ border: "1px solid var(--p-line)", borderRadius: 12, background: "#fff", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--p-muted)", fontSize: 12 }}>
                <th style={{ padding: "10px 14px" }}>{T.acomodacao}</th>
                <th style={{ padding: "10px 14px" }}>{T.conteudo}</th>
                <th style={{ padding: "10px 14px" }}></th>
              </tr>
            </thead>
            <tbody>
              {produtos.map((p) => {
                const st = statusPorProduto.get(p.id);
                const badge = st ? statusConteudoLabel(sessao.language, st.status) : null;
                return (
                  <tr key={p.id} style={{ borderTop: "1px solid var(--p-line)", color: "var(--p-ink)" }}>
                    <td style={{ padding: "10px 14px" }}>{p.name}</td>
                    <td style={{ padding: "10px 14px", fontWeight: 600, color: badge ? badge.cor : "var(--p-muted)" }}>
                      {badge ? badge.texto : T.semConteudo}
                      {st?.status === "rejected" && st.rejectReason ? (
                        <div style={{ fontWeight: 400, fontSize: 12, color: "var(--p-muted)" }}>{st.rejectReason}</div>
                      ) : null}
                    </td>
                    <td style={{ padding: "10px 14px", textAlign: "right" }}>
                      <Link href={`/fornecedor/acomodacoes/${p.id}`} style={{ color: "var(--p-accent-ink)", textDecoration: "none", fontSize: 13 }}>
                        {st?.status === "pending_admin" || st?.status === "approved" ? T.ver : T.editarConteudo}
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
