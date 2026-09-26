import Link from "next/link";
import { exigirFornecedor } from "@/lib/fornecedor-guard";
import {
  getServiceClient,
  contarPainelFornecedor,
  listarPendenciasDoFornecedor,
} from "@/lib/fornecedor-dados";
import { contarPorSeveridade } from "@/lib/fornecedor-pendencias";
import { listarPendentesDoFornecedor } from "@/lib/confirmacao-service";
import { ITENS_INVENTARIO_FORNECEDOR, textoNavFornecedor } from "@/lib/fornecedor-nav";
import { t } from "@/lib/fornecedor-i18n";
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
  const idioma = sessao.language;

  const T = t(idioma, {
    pt: {
      painel: "Painel",
      subtitulo: "Visão geral dos seus estudantes na EXP Tour.",
      pendencias: "Pendências",
      urgente: (n: number) => `${n} urgente${n > 1 ? "s" : ""}`,
      noTotal: (n: number) => `${n} no total`,
      estudantes: "Estudantes",
      ativos: "Ativos",
      cancelados: "Cancelados",
      verEstudantes: "Ver estudantes →",
      seuInventario: "Seu inventário",
      semEstudantes:
        "Ainda não há estudantes vinculados à sua instituição. Assim que os contratos forem vinculados no sistema, eles aparecem aqui.",
    },
    en: {
      painel: "Dashboard",
      subtitulo: "Overview of your students at EXP Tour.",
      pendencias: "Pending items",
      urgente: (n: number) => `${n} urgent`,
      noTotal: (n: number) => `${n} total`,
      estudantes: "Students",
      ativos: "Active",
      cancelados: "Cancelled",
      verEstudantes: "View students →",
      seuInventario: "Your inventory",
      semEstudantes:
        "No students linked to your institution yet. As soon as contracts are linked in the system, they'll show up here.",
    },
  });

  const cards = [
    { label: T.estudantes, valor: contadores.total, cor: "var(--p-ink)" },
    { label: T.ativos, valor: contadores.ativos, cor: "var(--p-success-ink)" },
    { label: T.cancelados, valor: contadores.cancelados, cor: "#b91c1c" },
  ];

  return (
    <div>
      <h1 style={{ fontFamily: "var(--p-heading)", color: "var(--p-ink)", fontSize: 26, margin: "0 0 4px" }}>
        {T.painel}
      </h1>
      <p style={{ color: "var(--p-ink)", opacity: 0.75, fontSize: 14, margin: "0 0 20px" }}>
        {T.subtitulo}
      </p>

      <ConfirmacoesFornecedor pedidos={confirmacoes} language={idioma} />

      {pendencias.length > 0 ? (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
            <h2 style={{ fontFamily: "var(--p-heading)", color: "var(--p-ink)", fontSize: 20, margin: 0 }}>
              {T.pendencias}
            </h2>
            <span style={{ fontSize: 12, color: "var(--p-muted)" }}>
              {sev.urgente > 0 ? `${T.urgente(sev.urgente)} · ` : ""}
              {T.noTotal(pendencias.length)}
            </span>
          </div>
          <PendenciasLista pendencias={pendencias} comLinkEstudante language={idioma} />
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
        {T.verEstudantes}
      </Link>

      {/* Inventory home (estilo Edvisor): atalhos para os verticais do fornecedor. */}
      <h2 style={{ fontFamily: "var(--p-heading)", color: "var(--p-ink)", fontSize: 20, margin: "28px 0 12px" }}>
        {T.seuInventario}
      </h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
        {ITENS_INVENTARIO_FORNECEDOR.map((item) => {
          const texto = textoNavFornecedor(item, idioma);
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
                border: "1px solid var(--p-line)",
                borderRadius: 12,
                background: "#fff",
                padding: 16,
                textDecoration: "none",
              }}
            >
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: "var(--p-accent-soft)",
                  color: "var(--p-accent-ink)",
                  flexShrink: 0,
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" width={18} height={18} aria-hidden="true">
                  <path d={item.icone} />
                </svg>
              </span>
              <span>
                <span style={{ display: "block", fontSize: 14, fontWeight: 600, color: "var(--p-ink)" }}>{texto.label}</span>
                {texto.descricao ? (
                  <span style={{ display: "block", fontSize: 12, color: "var(--p-muted)", marginTop: 2 }}>{texto.descricao}</span>
                ) : null}
              </span>
            </Link>
          );
        })}
      </div>

      {contadores.total === 0 ? (
        <p style={{ marginTop: 20, fontSize: 13, color: "var(--p-muted)" }}>
          {T.semEstudantes}
        </p>
      ) : null}
    </div>
  );
}
