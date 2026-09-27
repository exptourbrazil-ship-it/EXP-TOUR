"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { t } from "@/lib/fornecedor-i18n";

// Cria um NOVO campus (tabela `campus`, unidade/escola do fornecedor) como
// RASCUNHO (status='draft' — ver criarCampus em catalog-disponibilidade.ts)
// e leva direto pro editor de conteúdo desse campus. Só pede identidade mínima
// (nome/país/cidade/região) — moeda/fuso ficam com default até a EXP Tour
// ajustar na aprovação. Nada fica visível/vendável até a EXP Tour aprovar o
// conteúdo (campus-content-admin-service.aprovarConteudoCampusPeloAdmin, que
// promove o campus pra 'active' na 1a aprovação). Reaproveita o mesmo
// endpoint/ação que Cursos e Acomodações já usam.
export default function NovoCampusForm({ idioma }: { idioma: string | null | undefined }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [pais, setPais] = useState("");
  const [cidade, setCidade] = useState("");
  const [regiao, setRegiao] = useState("");

  const T = t(idioma, {
    pt: {
      botaoAbrir: "+ Novo campus",
      tituloForm: "Novo campus",
      nome: "Nome (ex.: Connect — Downtown)",
      pais: "País (ISO-2, ex.: CA)",
      cidade: "Cidade",
      regiao: "Região / Estado (opcional)",
      criar: "Criar e editar conteúdo",
      cancelar: "Cancelar",
      erroNome: "Informe o nome do campus.",
      erroCidade: "Informe a cidade do campus.",
      erroPais: "Informe o país em ISO-2 (ex.: CA, IE, AU).",
      erroGenerico: "Falha ao criar o campus.",
      erroRede: "Erro de rede. Tente novamente.",
      aviso:
        "O campus é criado como rascunho — só fica visível para os estudantes depois que a EXP Tour aprovar o conteúdo. Moeda e fuso horário ficam com um valor padrão até lá.",
    },
    en: {
      botaoAbrir: "+ New campus",
      tituloForm: "New campus",
      nome: "Name (e.g. Connect — Downtown)",
      pais: "Country (ISO-2, e.g. CA)",
      cidade: "City",
      regiao: "Region / State (optional)",
      criar: "Create and edit content",
      cancelar: "Cancel",
      erroNome: "Enter the campus name.",
      erroCidade: "Enter the campus city.",
      erroPais: "Enter the country as ISO-2 (e.g. CA, IE, AU).",
      erroGenerico: "Failed to create the campus.",
      erroRede: "Network error. Try again.",
      aviso:
        "The campus is created as a draft — it only becomes visible to students after EXP Tour approves the content. Currency and timezone keep a default value until then.",
    },
  });

  async function criar() {
    if (!nome.trim()) {
      setErro(T.erroNome);
      return;
    }
    if (!cidade.trim()) {
      setErro(T.erroCidade);
      return;
    }
    if (!/^[A-Za-z]{2}$/.test(pais.trim())) {
      setErro(T.erroPais);
      return;
    }
    setOcupado(true);
    setErro(null);
    try {
      const res = await fetch("/api/fornecedor/disponibilidade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          acao: "criar_campus",
          name: nome,
          countryCode: pais,
          city: cidade,
          region: regiao,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setErro(json.erro || T.erroGenerico);
        return;
      }
      router.push(`/fornecedor/escolas/${json.id}`);
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
        <input
          value={pais}
          onChange={(e) => setPais(e.target.value.toUpperCase())}
          placeholder={T.pais}
          maxLength={2}
          style={inp(110)}
        />
        <input value={cidade} onChange={(e) => setCidade(e.target.value)} placeholder={T.cidade} style={inp(160)} />
        <input value={regiao} onChange={(e) => setRegiao(e.target.value)} placeholder={T.regiao} style={inp(180)} />
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
