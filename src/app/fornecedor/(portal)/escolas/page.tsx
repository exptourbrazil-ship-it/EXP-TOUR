import Link from "next/link";
import { exigirFornecedor } from "@/lib/fornecedor-guard";
import { getServiceClient } from "@/lib/fornecedor-dados";
import { listarCampiDoFornecedor, listarConteudoCampusDoFornecedor } from "@/lib/campus-content-submission-service";
import { t, statusConteudoLabel } from "@/lib/fornecedor-i18n";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Conteúdo das escolas (Fase B2): sobre a escola, destaques, fotos, estrutura,
// acreditações e mix de nacionalidades — o que aparece em "Sobre a escola" na
// cotação. Escopado ao supplier.
export default async function EscolasFornecedorPage() {
  const sessao = await exigirFornecedor("/fornecedor/escolas");
  const supabase = getServiceClient();
  const [campi, submissions] = await Promise.all([
    listarCampiDoFornecedor(supabase, sessao.supplierId),
    listarConteudoCampusDoFornecedor(supabase, sessao.supplierId),
  ]);
  const statusPorCampus = new Map<string, { status: string; rejectReason: string | null }>();
  for (const s of submissions) {
    if (!statusPorCampus.has(s.campusId)) statusPorCampus.set(s.campusId, { status: s.status, rejectReason: s.rejectReason });
  }

  const T = t(sessao.language, {
    pt: {
      titulo: "Conteúdo das escolas",
      subtitulo:
        "Descreva cada unidade (sobre a escola, destaques, fotos, estrutura, acreditações e mix de nacionalidades). Você edita um rascunho e envia; a EXP Tour aprova e publica.",
      nenhumaEscola: "Nenhuma escola cadastrada ainda.",
      escola: "Escola",
      conteudo: "Conteúdo",
      semConteudo: "Sem conteúdo",
      ver: "Ver →",
      editarConteudo: "Editar conteúdo →",
    },
    en: {
      titulo: "Campus content",
      subtitulo:
        "Describe each campus (about it, highlights, photos, facilities, accreditations and nationality mix). Edit a draft and submit it; EXP Tour approves and publishes it.",
      nenhumaEscola: "No campus registered yet.",
      escola: "Campus",
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

      {campi.length === 0 ? (
        <p style={{ color: "var(--p-muted)", fontSize: 14 }}>{T.nenhumaEscola}</p>
      ) : (
        <div style={{ border: "1px solid var(--p-line)", borderRadius: 12, background: "#fff", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--p-muted)", fontSize: 12 }}>
                <th style={{ padding: "10px 14px" }}>{T.escola}</th>
                <th style={{ padding: "10px 14px" }}>{T.conteudo}</th>
                <th style={{ padding: "10px 14px" }}></th>
              </tr>
            </thead>
            <tbody>
              {campi.map((c) => {
                const st = statusPorCampus.get(c.id);
                const badge = st ? statusConteudoLabel(sessao.language, st.status) : null;
                return (
                  <tr key={c.id} style={{ borderTop: "1px solid var(--p-line)", color: "var(--p-ink)" }}>
                    <td style={{ padding: "10px 14px" }}>
                      {c.name}
                      {c.city ? <span style={{ color: "var(--p-muted)", fontSize: 12 }}> · {c.city}</span> : null}
                    </td>
                    <td style={{ padding: "10px 14px", fontWeight: 600, color: badge ? badge.cor : "var(--p-muted)" }}>
                      {badge ? badge.texto : T.semConteudo}
                      {st?.status === "rejected" && st.rejectReason ? (
                        <div style={{ fontWeight: 400, fontSize: 12, color: "var(--p-muted)" }}>{st.rejectReason}</div>
                      ) : null}
                    </td>
                    <td style={{ padding: "10px 14px", textAlign: "right" }}>
                      <Link href={`/fornecedor/escolas/${c.id}`} style={{ color: "var(--p-accent-ink)", textDecoration: "none", fontSize: 13 }}>
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
