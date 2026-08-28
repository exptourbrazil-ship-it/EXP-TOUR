import Link from "next/link";
import { exigirFornecedor } from "@/lib/fornecedor-guard";
import { getServiceClient } from "@/lib/fornecedor-dados";
import { listarSubmissionsDoFornecedor } from "@/lib/price-submission-service";
import UploadPriceList from "./UploadPriceList";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, { texto: string; cor: string }> = {
  draft: { texto: "Rascunho", cor: "#8a6d2f" },
  pending_admin: { texto: "Aguardando EXP Tour", cor: "#1d4ed8" },
  approved: { texto: "Publicado", cor: "#15803d" },
  rejected: { texto: "Recusado", cor: "#b91c1c" },
};

// Preços (Fase C): a escola sobe o price list (PDF), a IA extrai um rascunho, a
// escola revisa e aprova; a EXP Tour publica. Escopado ao supplier da sessao.
export default async function PrecosPage() {
  const sessao = await exigirFornecedor("/fornecedor/precos");
  const supabase = getServiceClient();
  const submissions = await listarSubmissionsDoFornecedor(supabase, sessao.supplierId);

  return (
    <div>
      <h1 style={{ fontFamily: "Bellefair, serif", color: "#042f1b", fontSize: 26, margin: "0 0 4px" }}>Preços</h1>
      <p style={{ color: "#042f1b", opacity: 0.75, fontSize: 14, margin: "0 0 20px" }}>
        Envie o seu price list em PDF. Extraímos um rascunho para você revisar; depois de aprovar, a
        EXP Tour publica no catálogo.
      </p>

      <UploadPriceList />

      <h2 style={{ fontFamily: "Bellefair, serif", color: "#042f1b", fontSize: 20, margin: "24px 0 12px" }}>
        Seus envios
      </h2>
      {submissions.length === 0 ? (
        <p style={{ color: "#6b7280", fontSize: 14 }}>Nenhum price list enviado ainda.</p>
      ) : (
        <div style={{ border: "1px solid #d8ccb4", borderRadius: 12, background: "#fff", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "#6b7280", fontSize: 12 }}>
                <th style={{ padding: "10px 14px" }}>Arquivo</th>
                <th style={{ padding: "10px 14px" }}>Itens</th>
                <th style={{ padding: "10px 14px" }}>Status</th>
                <th style={{ padding: "10px 14px" }}></th>
              </tr>
            </thead>
            <tbody>
              {submissions.map((s) => {
                const st = STATUS_LABEL[s.status] || { texto: s.status, cor: "#6b7280" };
                return (
                  <tr key={s.id} style={{ borderTop: "1px solid #eee7d8", color: "#042f1b" }}>
                    <td style={{ padding: "10px 14px" }}>{s.sourceFilename || "—"}</td>
                    <td style={{ padding: "10px 14px" }}>
                      {s.itens} {s.currency ? `· ${s.currency}` : ""}
                    </td>
                    <td style={{ padding: "10px 14px", color: st.cor, fontWeight: 600 }}>{st.texto}</td>
                    <td style={{ padding: "10px 14px", textAlign: "right" }}>
                      <Link href={`/fornecedor/precos/${s.id}`} style={{ color: "#c9a35e", textDecoration: "none", fontSize: 13 }}>
                        {s.status === "draft" ? "Revisar →" : "Ver →"}
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
