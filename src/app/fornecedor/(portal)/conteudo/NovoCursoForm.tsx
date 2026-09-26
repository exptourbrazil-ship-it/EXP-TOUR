"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { t } from "@/lib/fornecedor-i18n";

// Cria um curso (product kind='program') como RASCUNHO OCULTO (status=draft,
// visibility=hidden — ver criarPrograma em catalog-disponibilidade.ts) e leva
// direto pro editor de conteúdo desse curso. Nada fica visível/vendável até a
// EXP Tour aprovar o conteúdo (content-admin-service.aprovarConteudoPeloAdmin).
// Reaproveita a mesma ação/endpoint que a aba Disponibilidade usava antes.
export default function NovoCursoForm({ idioma }: { idioma: string | null | undefined }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [idiomaCurso, setIdiomaCurso] = useState("");
  const [durMin, setDurMin] = useState("");
  const [durMax, setDurMax] = useState("");

  const T = t(idioma, {
    pt: {
      botaoAbrir: "+ Novo curso",
      tituloForm: "Novo curso",
      nome: "Nome (ex.: General English)",
      idioma: "Idioma (ex.: en)",
      durMin: "Dur. mín (semanas)",
      durMax: "Dur. máx (semanas)",
      criar: "Criar e editar conteúdo",
      cancelar: "Cancelar",
      erroNome: "Informe o nome do curso.",
      erroGenerico: "Falha ao criar o curso.",
      erroRede: "Erro de rede. Tente novamente.",
      aviso: "O curso é criado como rascunho — só fica visível para os estudantes depois que a EXP Tour aprovar o conteúdo.",
    },
    en: {
      botaoAbrir: "+ New course",
      tituloForm: "New course",
      nome: "Name (e.g. General English)",
      idioma: "Language (e.g. en)",
      durMin: "Min. duration (weeks)",
      durMax: "Max. duration (weeks)",
      criar: "Create and edit content",
      cancelar: "Cancel",
      erroNome: "Enter the course name.",
      erroGenerico: "Failed to create the course.",
      erroRede: "Network error. Try again.",
      aviso: "The course is created as a draft — it only becomes visible to students after EXP Tour approves the content.",
    },
  });

  async function criar() {
    if (!nome.trim()) {
      setErro(T.erroNome);
      return;
    }
    setOcupado(true);
    setErro(null);
    try {
      const res = await fetch("/api/fornecedor/disponibilidade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          acao: "criar_programa",
          name: nome,
          language: idiomaCurso,
          minDuration: durMin,
          maxDuration: durMax,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setErro(json.erro || T.erroGenerico);
        return;
      }
      router.push(`/fornecedor/conteudo/${json.id}`);
    } catch {
      setErro(T.erroRede);
    } finally {
      setOcupado(false);
    }
  }

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        style={{
          marginBottom: 16,
          background: "var(--p-accent, #042f1b)",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          padding: "9px 16px",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        {T.botaoAbrir}
      </button>
    );
  }

  return (
    <div style={{ border: "1px solid var(--p-line)", borderRadius: 12, background: "#fff", padding: 16, marginBottom: 18 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--p-ink)", marginBottom: 4 }}>{T.tituloForm}</div>
      <p style={{ fontSize: 12, color: "var(--p-muted)", margin: "0 0 10px" }}>{T.aviso}</p>
      {erro ? (
        <div style={{ marginBottom: 10, borderRadius: 8, padding: "8px 12px", fontSize: 13, border: "1px solid #fecaca", background: "#fef2f2", color: "#b91c1c" }}>
          {erro}
        </div>
      ) : null}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder={T.nome} style={inp(240)} />
        <input value={idiomaCurso} onChange={(e) => setIdiomaCurso(e.target.value)} placeholder={T.idioma} style={inp(120)} />
        <input value={durMin} onChange={(e) => setDurMin(e.target.value)} placeholder={T.durMin} style={inp(140)} inputMode="numeric" />
        <input value={durMax} onChange={(e) => setDurMax(e.target.value)} placeholder={T.durMax} style={inp(140)} inputMode="numeric" />
        <button type="button" onClick={criar} disabled={ocupado} style={btnPrim(ocupado)}>
          {T.criar}
        </button>
        <button
          type="button"
          onClick={() => setAberto(false)}
          disabled={ocupado}
          style={{ background: "none", border: "none", color: "var(--p-muted)", fontSize: 13, cursor: "pointer" }}
        >
          {T.cancelar}
        </button>
      </div>
    </div>
  );
}

function inp(width: number): React.CSSProperties {
  return { width, border: "1px solid var(--p-line)", borderRadius: 8, padding: "8px 10px", fontSize: 13, background: "#fff" };
}
function btnPrim(disabled: boolean): React.CSSProperties {
  return {
    background: "var(--p-accent, #042f1b)",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    padding: "8px 14px",
    fontSize: 13,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.6 : 1,
  };
}
