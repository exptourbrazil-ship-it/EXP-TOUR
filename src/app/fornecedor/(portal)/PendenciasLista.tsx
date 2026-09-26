import Link from "next/link";
import type { Pendencia, Severidade, TipoPendencia } from "@/lib/fornecedor-pendencias";
import { t } from "@/lib/fornecedor-i18n";

// Estilo por severidade (cor de borda/fundo + rotulo). Estados sempre
// icone + cor + texto (marca: dourado so para atencao; vermelho so urgente).
const CORES_SEVERIDADE: Record<Severidade, { cor: string; fundo: string }> = {
  urgente: { cor: "#b91c1c", fundo: "#fdf2f2" },
  atencao: { cor: "var(--p-accent-ink)", fundo: "var(--p-accent-soft)" },
  info: { cor: "var(--p-success-ink)", fundo: "var(--p-success-soft)" },
};

// Pendencia.titulo (de fornecedor-pendencias.ts) vem sempre em PT — o motor de
// pendencias e puro/testado e nao muda. Em "en" a lista usa este mapa (por
// tipo) em vez de p.titulo, sem tocar no motor.
const TITULO_EN: Record<TipoPendencia, string> = {
  nova_matricula: "New student — review details and documents",
  loa_pendente: "Submit the Letter of Acceptance (LOA)",
  documento_devolvido: "Document returned — fix and resend",
  docs_viagem: "Travel documents available to download",
};

function subtexto(p: Pendencia, idioma: string | null | undefined): string {
  const en = idioma !== "pt";
  const partes: string[] = [];
  if (p.estudanteNome) partes.push(p.estudanteNome);
  if (p.tipo === "loa_pendente" && p.idadeDias != null) {
    partes.push(
      en
        ? `${p.idadeDias} ${p.idadeDias === 1 ? "day" : "days"} ago · due D+${p.prazoDias}`
        : `há ${p.idadeDias} ${p.idadeDias === 1 ? "dia" : "dias"} · prazo D+${p.prazoDias}`
    );
  } else if (p.tipo === "nova_matricula" && p.idadeDias != null) {
    partes.push(en ? `${p.idadeDias} ${p.idadeDias === 1 ? "day" : "days"} ago` : `há ${p.idadeDias} ${p.idadeDias === 1 ? "dia" : "dias"}`);
  }
  return partes.join(" · ");
}

// Lista de pendencias (matriz 1-4). Usada no topo do Painel (comLinkEstudante)
// e no detalhe do estudante (sem link, ja estamos no estudante).
export default function PendenciasLista({
  pendencias,
  comLinkEstudante = false,
  language,
}: {
  pendencias: Pendencia[];
  comLinkEstudante?: boolean;
  language?: string;
}) {
  if (pendencias.length === 0) return null;

  const ROTULO_SEVERIDADE = t(language, {
    pt: { urgente: "Urgente", atencao: "Atenção", info: "Info" },
    en: { urgente: "Urgent", atencao: "Attention", info: "Info" },
  });

  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
      {pendencias.map((p, i) => {
        const e = CORES_SEVERIDADE[p.severidade];
        const titulo = language !== "pt" ? TITULO_EN[p.tipo] : p.titulo;
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
              <div style={{ color: "var(--p-ink)", fontSize: 14, fontWeight: 600 }}>{titulo}</div>
              {subtexto(p, language) ? (
                <div style={{ color: "var(--p-muted)", fontSize: 12 }}>{subtexto(p, language)}</div>
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
              {ROTULO_SEVERIDADE[p.severidade]}
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
