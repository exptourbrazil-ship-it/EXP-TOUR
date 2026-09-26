import Link from "next/link";
import { exigirFornecedor } from "@/lib/fornecedor-guard";
import { getServiceClient, listarEstudantesDoFornecedor } from "@/lib/fornecedor-dados";
import { t } from "@/lib/fornecedor-i18n";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Formatacao leve para exibicao (os dados vem em slug/minusculo do CRM).
function titulo(s: string | null): string {
  if (!s) return "—";
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// Lista de estudantes (contratos) do fornecedor logado. Filtrada estritamente
// pelo supplier_id da sessao (uma escola nunca ve estudante de outra).
export default async function EstudantesFornecedorPage() {
  const sessao = await exigirFornecedor("/fornecedor/estudantes");
  const supabase = getServiceClient();
  const estudantes = await listarEstudantesDoFornecedor(supabase, sessao.supplierId);

  const T = t(sessao.language, {
    pt: {
      titulo: "Estudantes",
      nenhumEstudante: "Nenhum estudante vinculado à sua instituição ainda.",
      colEstudante: "Estudante",
      colPrograma: "Programa",
      colDestino: "Destino",
      colVisto: "Visto",
      semNome: "(sem nome)",
      responsavel: "Resp.:",
      cancelado: "cancelado",
      abrir: "Abrir →",
    },
    en: {
      titulo: "Students",
      nenhumEstudante: "No students linked to your institution yet.",
      colEstudante: "Student",
      colPrograma: "Program",
      colDestino: "Destination",
      colVisto: "Visa",
      semNome: "(no name)",
      responsavel: "Guardian:",
      cancelado: "cancelled",
      abrir: "Open →",
    },
  });

  return (
    <div>
      <h1 style={{ fontFamily: "var(--p-heading)", color: "var(--p-ink)", fontSize: 26, margin: "0 0 16px" }}>
        {T.titulo}
      </h1>

      {estudantes.length === 0 ? (
        <div style={{ border: "1px solid var(--p-line)", borderRadius: 12, background: "#fff", padding: 20, color: "var(--p-muted)", fontSize: 14 }}>
          {T.nenhumEstudante}
        </div>
      ) : (
        <div style={{ border: "1px solid var(--p-line)", borderRadius: 12, background: "#fff", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--p-muted)", fontSize: 12 }}>
                <th style={{ padding: "10px 14px" }}>{T.colEstudante}</th>
                <th style={{ padding: "10px 14px" }}>{T.colPrograma}</th>
                <th style={{ padding: "10px 14px" }}>{T.colDestino}</th>
                <th style={{ padding: "10px 14px" }}>{T.colVisto}</th>
                <th style={{ padding: "10px 14px" }}></th>
              </tr>
            </thead>
            <tbody>
              {estudantes.map((e) => (
                <tr key={e.contratoId} style={{ borderTop: "1px solid var(--p-line)", color: "var(--p-ink)" }}>
                  <td style={{ padding: "10px 14px" }}>
                    <div style={{ fontWeight: 600 }}>{e.estudanteNome || T.semNome}</div>
                    {e.titularNome ? (
                      <div style={{ fontSize: 12, color: "var(--p-muted)" }}>{T.responsavel} {e.titularNome}</div>
                    ) : null}
                    {e.canceladoEm ? (
                      <span style={{ fontSize: 11, color: "#b91c1c" }}>{T.cancelado}</span>
                    ) : null}
                  </td>
                  <td style={{ padding: "10px 14px" }}>{e.programa || "—"}</td>
                  <td style={{ padding: "10px 14px" }}>{titulo(e.paisDestino)}</td>
                  <td style={{ padding: "10px 14px" }}>{titulo(e.vistoStatus)}</td>
                  <td style={{ padding: "10px 14px", textAlign: "right" }}>
                    <Link
                      href={`/fornecedor/estudantes/${e.contratoId}`}
                      style={{ color: "var(--p-accent-ink)", textDecoration: "none", fontSize: 13 }}
                    >
                      {T.abrir}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
