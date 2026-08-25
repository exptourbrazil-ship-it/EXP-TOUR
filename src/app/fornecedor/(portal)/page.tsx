import Link from "next/link";
import { exigirFornecedor } from "@/lib/fornecedor-guard";
import { getServiceClient, contarPainelFornecedor } from "@/lib/fornecedor-dados";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Painel (home) do Portal do Fornecedor. Fase A v1: contadores dos estudantes
// do fornecedor + atalho para a lista. Pendencias/feed e alertas entram nas
// proximas fatias.
export default async function PainelFornecedorPage() {
  const sessao = await exigirFornecedor("/fornecedor");
  const supabase = getServiceClient();
  const contadores = await contarPainelFornecedor(supabase, sessao.supplierId);

  const cards = [
    { label: "Estudantes", valor: contadores.total, cor: "#042f1b" },
    { label: "Ativos", valor: contadores.ativos, cor: "#15803d" },
    { label: "Cancelados", valor: contadores.cancelados, cor: "#b91c1c" },
  ];

  return (
    <div>
      <h1 style={{ fontFamily: "Bellefair, serif", color: "#042f1b", fontSize: 26, margin: "0 0 4px" }}>
        Painel
      </h1>
      <p style={{ color: "#042f1b", opacity: 0.75, fontSize: 14, margin: "0 0 20px" }}>
        Visão geral dos seus estudantes na EXP Tour.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 24 }}>
        {cards.map((c) => (
          <div key={c.label} style={{ border: "1px solid #d8ccb4", borderRadius: 12, background: "#fff", padding: 16 }}>
            <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 1, color: "#6b7280" }}>
              {c.label}
            </div>
            <div style={{ fontFamily: "Bellefair, serif", fontSize: 30, color: c.cor }}>{c.valor}</div>
          </div>
        ))}
      </div>

      <Link
        href="/fornecedor/estudantes"
        style={{
          display: "inline-block",
          background: "#042f1b",
          color: "#f5ead9",
          borderRadius: 8,
          padding: "10px 16px",
          fontSize: 14,
          textDecoration: "none",
        }}
      >
        Ver estudantes →
      </Link>

      {contadores.total === 0 ? (
        <p style={{ marginTop: 20, fontSize: 13, color: "#6b7280" }}>
          Ainda não há estudantes vinculados à sua instituição. Assim que os contratos forem
          vinculados no sistema, eles aparecem aqui.
        </p>
      ) : null}
    </div>
  );
}
