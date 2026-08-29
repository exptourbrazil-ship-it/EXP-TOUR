import Link from "next/link";
import { exigirFornecedor } from "@/lib/fornecedor-guard";
import {
  getServiceClient,
  contarPainelFornecedor,
  listarPendenciasDoFornecedor,
} from "@/lib/fornecedor-dados";
import { contarPorSeveridade } from "@/lib/fornecedor-pendencias";
import { listarPendentesDoFornecedor } from "@/lib/confirmacao-service";
import PendenciasLista from "./PendenciasLista";
import ConfirmacoesFornecedor from "./ConfirmacoesFornecedor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Painel (home) do Portal do Fornecedor. Fase A v1: contadores dos estudantes
// do fornecedor + atalho para a lista. Pendencias/feed e alertas entram nas
// proximas fatias.
export default async function PainelFornecedorPage() {
  const sessao = await exigirFornecedor("/fornecedor");
  const supabase = getServiceClient();
  const [contadores, pendencias, confirmacoes] = await Promise.all([
    contarPainelFornecedor(supabase, sessao.supplierId),
    listarPendenciasDoFornecedor(supabase, sessao.supplierId),
    listarPendentesDoFornecedor(supabase, sessao.supplierId),
  ]);
  const sev = contarPorSeveridade(pendencias);

  const cards = [
    { label: "Estudantes", valor: contadores.total, cor: "var(--p-ink)" },
    { label: "Ativos", valor: contadores.ativos, cor: "var(--p-success-ink)" },
    { label: "Cancelados", valor: contadores.cancelados, cor: "#b91c1c" },
  ];

  return (
    <div>
      <h1 style={{ fontFamily: "var(--p-heading)", color: "var(--p-ink)", fontSize: 26, margin: "0 0 4px" }}>
        Painel
      </h1>
      <p style={{ color: "var(--p-ink)", opacity: 0.75, fontSize: 14, margin: "0 0 20px" }}>
        Visão geral dos seus estudantes na EXP Tour.
      </p>

      <ConfirmacoesFornecedor pedidos={confirmacoes} />

      {pendencias.length > 0 ? (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
            <h2 style={{ fontFamily: "var(--p-heading)", color: "var(--p-ink)", fontSize: 20, margin: 0 }}>
              Pendências
            </h2>
            <span style={{ fontSize: 12, color: "var(--p-muted)" }}>
              {sev.urgente > 0 ? `${sev.urgente} urgente${sev.urgente > 1 ? "s" : ""} · ` : ""}
              {pendencias.length} no total
            </span>
          </div>
          <PendenciasLista pendencias={pendencias} comLinkEstudante />
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 24 }}>
        {cards.map((c) => (
          <div key={c.label} style={{ border: "1px solid var(--p-line)", borderRadius: 12, background: "#fff", padding: 16 }}>
            <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 1, color: "var(--p-muted)" }}>
              {c.label}
            </div>
            <div style={{ fontFamily: "var(--p-heading)", fontSize: 30, color: c.cor }}>{c.valor}</div>
          </div>
        ))}
      </div>

      <Link
        href="/fornecedor/estudantes"
        style={{
          display: "inline-block",
          background: "var(--p-cta)",
          color: "var(--p-cta-fg)",
          borderRadius: 8,
          padding: "10px 16px",
          fontSize: 14,
          textDecoration: "none",
        }}
      >
        Ver estudantes →
      </Link>

      {contadores.total === 0 ? (
        <p style={{ marginTop: 20, fontSize: 13, color: "var(--p-muted)" }}>
          Ainda não há estudantes vinculados à sua instituição. Assim que os contratos forem
          vinculados no sistema, eles aparecem aqui.
        </p>
      ) : null}
    </div>
  );
}
