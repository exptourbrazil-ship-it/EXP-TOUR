import Link from "next/link";
import { exigirFornecedor } from "@/lib/fornecedor-guard";
import { getServiceClient, listarEstudantesDoFornecedor } from "@/lib/fornecedor-dados";

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

  return (
    <div>
      <h1 style={{ fontFamily: "Bellefair, serif", color: "#042f1b", fontSize: 26, margin: "0 0 16px" }}>
        Estudantes
      </h1>

      {estudantes.length === 0 ? (
        <div style={{ border: "1px solid #d8ccb4", borderRadius: 12, background: "#fff", padding: 20, color: "#6b7280", fontSize: 14 }}>
          Nenhum estudante vinculado à sua instituição ainda.
        </div>
      ) : (
        <div style={{ border: "1px solid #d8ccb4", borderRadius: 12, background: "#fff", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "#6b7280", fontSize: 12 }}>
                <th style={{ padding: "10px 14px" }}>Estudante</th>
                <th style={{ padding: "10px 14px" }}>Programa</th>
                <th style={{ padding: "10px 14px" }}>Destino</th>
                <th style={{ padding: "10px 14px" }}>Visto</th>
                <th style={{ padding: "10px 14px" }}></th>
              </tr>
            </thead>
            <tbody>
              {estudantes.map((e) => (
                <tr key={e.contratoId} style={{ borderTop: "1px solid #eee7d8", color: "#042f1b" }}>
                  <td style={{ padding: "10px 14px" }}>
                    <div style={{ fontWeight: 600 }}>{e.estudanteNome || "(sem nome)"}</div>
                    {e.titularNome ? (
                      <div style={{ fontSize: 12, color: "#6b7280" }}>Resp.: {e.titularNome}</div>
                    ) : null}
                    {e.canceladoEm ? (
                      <span style={{ fontSize: 11, color: "#b91c1c" }}>cancelado</span>
                    ) : null}
                  </td>
                  <td style={{ padding: "10px 14px" }}>{e.programa || "—"}</td>
                  <td style={{ padding: "10px 14px" }}>{titulo(e.paisDestino)}</td>
                  <td style={{ padding: "10px 14px" }}>{titulo(e.vistoStatus)}</td>
                  <td style={{ padding: "10px 14px", textAlign: "right" }}>
                    <Link
                      href={`/fornecedor/estudantes/${e.contratoId}`}
                      style={{ color: "#c9a35e", textDecoration: "none", fontSize: 13 }}
                    >
                      Abrir →
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
