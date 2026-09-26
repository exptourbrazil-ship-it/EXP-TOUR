import Link from "next/link";
import { exigirFornecedor } from "@/lib/fornecedor-guard";
import { getServiceClient } from "@/lib/fornecedor-dados";
import { listarProgramas } from "@/lib/catalog-disponibilidade";
import { listarConteudoDoFornecedor } from "@/lib/content-submission-service";
import { t, statusConteudoLabel } from "@/lib/fornecedor-i18n";
import NovoCursoForm from "./NovoCursoForm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Aba "Cursos" (rótulo; conceito interno continua "conteúdo"): a escola cria o
// curso (rascunho oculto — ver NovoCursoForm), descreve cada um (descrição,
// destaques, mídia, ficha) e envia; a EXP Tour aprova o conteúdo E publica o
// curso (ver content-admin-service.aprovarConteudoPeloAdmin). Escopado ao supplier.
export default async function ConteudoFornecedorPage() {
  const sessao = await exigirFornecedor("/fornecedor/conteudo");
  const supabase = getServiceClient();
  const [programas, submissions] = await Promise.all([
    listarProgramas(supabase, sessao.supplierId),
    listarConteudoDoFornecedor(supabase, sessao.supplierId),
  ]);
  // Última submission por produto (a lista já vem por updated_at desc).
  const statusPorProduto = new Map<string, { status: string; rejectReason: string | null }>();
  for (const s of submissions) {
    if (!statusPorProduto.has(s.productId)) statusPorProduto.set(s.productId, { status: s.status, rejectReason: s.rejectReason });
  }

  const T = t(sessao.language, {
    pt: {
      titulo: "Cursos",
      subtitulo:
        "Cadastre seus cursos e descreva cada um (descrição, destaques, o que inclui, fotos/vídeo e a ficha) — é o que o estudante vê na cotação. Você edita um rascunho e envia; a EXP Tour aprova e publica.",
      nenhumCurso: "Nenhum curso cadastrado ainda.",
      curso: "Curso",
      conteudo: "Conteúdo",
      semConteudo: "Sem conteúdo",
      ver: "Ver →",
      editarConteudo: "Editar conteúdo →",
    },
    en: {
      titulo: "Courses",
      subtitulo:
        "Register your courses and describe each one (description, highlights, what's included, photos/video and details) — this is what students see in the quote. Edit a draft and submit it; EXP Tour approves and publishes it.",
      nenhumCurso: "No courses registered yet.",
      curso: "Course",
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

      <NovoCursoForm idioma={sessao.language} />

      {programas.length === 0 ? (
        <p style={{ color: "var(--p-muted)", fontSize: 14 }}>{T.nenhumCurso}</p>
      ) : (
        <div style={{ border: "1px solid var(--p-line)", borderRadius: 12, background: "#fff", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--p-muted)", fontSize: 12 }}>
                <th style={{ padding: "10px 14px" }}>{T.curso}</th>
                <th style={{ padding: "10px 14px" }}>{T.conteudo}</th>
                <th style={{ padding: "10px 14px" }}></th>
              </tr>
            </thead>
            <tbody>
              {programas.map((p) => {
                const st = statusPorProduto.get(p.id);
                const badge = st ? statusConteudoLabel(sessao.language, st.status) : null;
                return (
                  <tr key={p.id} style={{ borderTop: "1px solid var(--p-line)", color: "var(--p-ink)" }}>
                    <td style={{ padding: "10px 14px" }}>
                      {p.name}
                      {p.language || p.educationType ? (
                        <span style={{ color: "var(--p-muted)", fontSize: 12 }}>
                          {" "}· {[p.educationType, p.language].filter(Boolean).join(" · ")}
                        </span>
                      ) : null}
                    </td>
                    <td style={{ padding: "10px 14px", fontWeight: 600, color: badge ? badge.cor : "var(--p-muted)" }}>
                      {badge ? badge.texto : T.semConteudo}
                      {st?.status === "rejected" && st.rejectReason ? (
                        <div style={{ fontWeight: 400, fontSize: 12, color: "var(--p-muted)" }}>{st.rejectReason}</div>
                      ) : null}
                    </td>
                    <td style={{ padding: "10px 14px", textAlign: "right" }}>
                      <Link href={`/fornecedor/conteudo/${p.id}`} style={{ color: "var(--p-accent-ink)", textDecoration: "none", fontSize: 13 }}>
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
