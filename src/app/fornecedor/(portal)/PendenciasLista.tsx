import Link from "next/link";
import type { Pendencia, Severidade } from "@/lib/fornecedor-pendencias";

// Estilo por severidade (cor de borda/fundo + rotulo). Estados sempre
// icone + cor + texto (marca: dourado so para atencao; vermelho so urgente).
const ESTILO: Record<Severidade, { cor: string; fundo: string; rotulo: string }> = {
  urgente: { cor: "#b91c1c", fundo: "#fdf2f2", rotulo: "Urgente" },
  atencao: { cor: "#8a6d2f", fundo: "#faf6ec", rotulo: "Atenção" },
  info: { cor: "#15803d", fundo: "#f2f8f4", rotulo: "Info" },
};

function subtexto(p: Pendencia): string {
  const partes: string[] = [];
  if (p.estudanteNome) partes.push(p.estudanteNome);
  if (p.tipo === "loa_pendente" && p.idadeDias != null) {
    partes.push(`há ${p.idadeDias} ${p.idadeDias === 1 ? "dia" : "dias"} · prazo D+${p.prazoDias}`);
  } else if (p.tipo === "nova_matricula" && p.idadeDias != null) {
    partes.push(`há ${p.idadeDias} ${p.idadeDias === 1 ? "dia" : "dias"}`);
  }
  return partes.join(" · ");
}

// Lista de pendencias (matriz 1-4). Usada no topo do Painel (comLinkEstudante)
// e no detalhe do estudante (sem link, ja estamos no estudante).
export default function PendenciasLista({
  pendencias,
  comLinkEstudante = false,
}: {
  pendencias: Pendencia[];
  comLinkEstudante?: boolean;
}) {
  if (pendencias.length === 0) return null;

  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
      {pendencias.map((p, i) => {
        const e = ESTILO[p.severidade];
        const linha = (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              border: `1px solid ${e.cor}33`,
              background: e.fundo,
              borderLeft: `4px solid ${e.cor}`,
              borderRadius: 10,
              padding: "10px 14px",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ color: "#042f1b", fontSize: 14, fontWeight: 600 }}>{p.titulo}</div>
              {subtexto(p) ? (
                <div style={{ color: "#6b7280", fontSize: 12 }}>{subtexto(p)}</div>
              ) : null}
            </div>
            <span
              style={{
                flexShrink: 0,
                color: e.cor,
                fontSize: 11,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              {e.rotulo}
            </span>
          </div>
        );

        return (
          <li key={`${p.tipo}-${p.contratoId}-${i}`}>
            {comLinkEstudante ? (
              <Link href={`/fornecedor/estudantes/${p.contratoId}`} style={{ textDecoration: "none" }}>
                {linha}
              </Link>
            ) : (
              linha
            )}
          </li>
        );
      })}
    </ul>
  );
}
