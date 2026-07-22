"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Painel administrativo para definir manualmente a data de inicio do curso
// de um titular, inclusive de clientes sem contrato. A autenticacao e feita
// pelo cookie de sessao de admin (login em /admin/login); as rotas de API
// aceitam esse cookie, entao nao e mais preciso digitar senha aqui.
type TitularAdmin = {
  id: string;
  nome_completo: string | null;
  email: string | null;
  data_inicio: string | null;
};

export default function DataInicioClient({ usuario }: { usuario: string }) {
  const router = useRouter();
  const [titulares, setTitulares] = useState<TitularAdmin[]>([]);
  const [carregandoLista, setCarregandoLista] = useState(false);
  const [titularId, setTitularId] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);

  async function carregarTitulares() {
    setCarregandoLista(true);
    setResultado(null);
    try {
      const res = await fetch("/api/admin/data-inicio", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setResultado("Erro ao carregar: " + (json.erro || "falha desconhecida"));
        setTitulares([]);
      } else {
        setTitulares(json.titulares || []);
        if (!json.titulares || json.titulares.length === 0) {
          setResultado("Nenhum titular encontrado.");
        }
      }
    } catch (err: any) {
      setResultado("Erro ao carregar: " + (err?.message || err));
    } finally {
      setCarregandoLista(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setResultado(null);
    try {
      const res = await fetch("/api/admin/data-inicio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titularId, dataInicio }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setResultado("Erro: " + (json.erro || "falha desconhecida"));
      } else {
        setResultado("Data salva com sucesso.");
        setTitulares((lista) =>
          lista.map((t) => (t.id === titularId ? { ...t, data_inicio: dataInicio || null } : t))
        );
      }
    } catch (err: any) {
      setResultado("Erro: " + (err?.message || err));
    } finally {
      setSalvando(false);
    }
  }

  async function sair() {
    await fetch("/api/admin/logout", { method: "POST" }).catch(() => {});
    router.replace("/admin/login");
  }

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "32px 20px", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>Data de inicio (admin)</h1>
        <button
          type="button"
          onClick={sair}
          style={{ fontSize: 12, padding: "6px 10px", borderRadius: 6, border: "1px solid #ccc", background: "#fff", cursor: "pointer" }}
        >
          Sair ({usuario})
        </button>
      </div>
      <p style={{ fontSize: 14, color: "#555", marginBottom: 24 }}>
        Define manualmente a data de inicio do curso de um titular. Funciona
        inclusive para clientes sem contrato cadastrado. A aba Inicio usa a
        data do contrato quando existe e, caso contrario, esta data.
      </p>

      <button
        type="button"
        onClick={carregarTitulares}
        disabled={carregandoLista}
        style={{ padding: "10px 16px", borderRadius: 8, border: "1px solid #042f1b", background: "#042f1b", color: "#f5ead9", cursor: "pointer", marginBottom: 24 }}
      >
        {carregandoLista ? "Carregando..." : "Carregar titulares"}
      </button>

      {titulares.length > 0 ? (
        <form onSubmit={handleSubmit}>
          <label style={{ display: "block", fontSize: 13, marginBottom: 4 }}>Titular</label>
          <select
            value={titularId}
            onChange={(e) => {
              setTitularId(e.target.value);
              const t = titulares.find((x) => x.id === e.target.value);
              setDataInicio(t?.data_inicio || "");
            }}
            required
            style={{ width: "100%", padding: 10, marginBottom: 12, borderRadius: 8, border: "1px solid #ccc" }}
          >
            <option value="">Selecione...</option>
            {titulares.map((t) => (
              <option key={t.id} value={t.id}>
                {(t.nome_completo || "(sem nome)") + (t.email ? " - " + t.email : "")}
                {t.data_inicio ? " [" + t.data_inicio + "]" : ""}
              </option>
            ))}
          </select>

          <label style={{ display: "block", fontSize: 13, marginBottom: 4 }}>Data de inicio (AAAA-MM-DD)</label>
          <input
            type="date"
            value={dataInicio}
            onChange={(e) => setDataInicio(e.target.value)}
            style={{ width: "100%", padding: 10, marginBottom: 6, borderRadius: 8, border: "1px solid #ccc" }}
          />
          <p style={{ fontSize: 12, color: "#777", marginTop: 0, marginBottom: 16 }}>
            Deixe em branco e salve para limpar a data.
          </p>

          <button
            type="submit"
            disabled={!titularId || salvando}
            style={{ padding: "10px 16px", borderRadius: 8, border: "none", background: "#c9a35e", color: "#042f1b", fontWeight: 600, cursor: "pointer" }}
          >
            {salvando ? "Salvando..." : "Salvar data de inicio"}
          </button>
        </form>
      ) : null}

      {resultado ? <p style={{ marginTop: 16, fontSize: 14 }}>{resultado}</p> : null}
    </div>
  );
}
