"use client"

import { useState } from "react"

// Painel administrativo simples para a equipe da EXP Tour definir
// manualmente a data de inicio do curso de um titular, inclusive de
// clientes que ainda nao possuem contrato. Protegido pela mesma senha
// (ADMIN_CAMBIO_SECRET) usada no cambio manual, enviada como Bearer token
// para a rota /api/admin/data-inicio. Nao ha autenticacao real de staff
// ainda, entao esta senha deve ser tratada como confidencial.

type TitularAdmin = {
  id: string
  nome_completo: string | null
  email: string | null
  data_inicio: string | null
}

export default function AdminDataInicioPage() {
  const [senha, setSenha] = useState("")
  const [titulares, setTitulares] = useState<TitularAdmin[]>([])
  const [carregandoLista, setCarregandoLista] = useState(false)
  const [titularId, setTitularId] = useState("")
  const [dataInicio, setDataInicio] = useState("")
  const [salvando, setSalvando] = useState(false)
  const [resultado, setResultado] = useState<string | null>(null)

  async function carregarTitulares() {
    setCarregandoLista(true)
    setResultado(null)
    try {
      const res = await fetch("/api/admin/data-inicio", {
        headers: { Authorization: "Bearer " + senha },
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setResultado("Erro ao carregar: " + (json.erro || "falha desconhecida"))
        setTitulares([])
      } else {
        setTitulares(json.titulares || [])
        if (!json.titulares || json.titulares.length === 0) {
          setResultado("Nenhum titular encontrado.")
        }
      }
    } catch (err: any) {
      setResultado("Erro ao carregar: " + (err?.message || err))
    } finally {
      setCarregandoLista(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true)
    setResultado(null)
    try {
      const res = await fetch("/api/admin/data-inicio", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + senha,
        },
        body: JSON.stringify({ titularId, dataInicio }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setResultado("Erro: " + (json.erro || "falha desconhecida"))
      } else {
        const nome = json.titular?.nome_completo || "titular"
        const d = json.titular?.data_inicio || "(sem data)"
        setResultado("Salvo! Data de inicio de " + nome + ": " + d)
        setTitulares((prev) =>
          prev.map((t) =>
            t.id === titularId ? { ...t, data_inicio: json.titular?.data_inicio || null } : t
          )
        )
      }
    } catch (err: any) {
      setResultado("Erro: " + (err?.message || err))
    } finally {
      setSalvando(false)
    }
  }

  const titularSelecionado = titulares.find((t) => t.id === titularId) || null

  return (
    <main style={{ maxWidth: 520, margin: "60px auto", padding: 24, fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: 20, marginBottom: 8 }}>Data de inicio (admin)</h1>
      <p style={{ fontSize: 14, color: "#555", marginBottom: 24 }}>
        Define manualmente a data de inicio do curso de um titular. Funciona
        inclusive para clientes sem contrato cadastrado. A aba Inicio usa a
        data do contrato quando existe e, caso contrario, esta data.
      </p>

      <label style={{ display: "block", fontSize: 13, marginBottom: 4 }}>Senha administrativa</label>
      <input
        type="password"
        value={senha}
        onChange={(e) => setSenha(e.target.value)}
        placeholder="ADMIN_CAMBIO_SECRET"
        style={{ width: "100%", padding: 10, marginBottom: 12, borderRadius: 8, border: "1px solid #ccc" }}
      />
      <button
        type="button"
        onClick={carregarTitulares}
        disabled={!senha || carregandoLista}
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
              setTitularId(e.target.value)
              const t = titulares.find((x) => x.id === e.target.value)
              setDataInicio(t?.data_inicio || "")
            }}
            required
            style={{ width: "100%", padding: 10, marginBottom: 12, borderRadius: 8, border: "1px solid #ccc" }}
          >
            <option value="">Selecione um titular...</option>
            {titulares.map((t) => (
              <option key={t.id} value={t.id}>
                {(t.nome_completo || "(sem nome)") + (t.data_inicio ? " - " + t.data_inicio : "")}
              </option>
            ))}
          </select>

          {titularSelecionado ? (
            <p style={{ fontSize: 12, color: "#777", marginBottom: 12 }}>
              {titularSelecionado.email || ""}
              {titularSelecionado.data_inicio ? " - data atual: " + titularSelecionado.data_inicio : " - sem data definida"}
            </p>
          ) : null}

          <label style={{ display: "block", fontSize: 13, marginBottom: 4 }}>Data de inicio do curso</label>
          <input
            type="date"
            value={dataInicio}
            onChange={(e) => setDataInicio(e.target.value)}
            style={{ width: "100%", padding: 10, marginBottom: 6, borderRadius: 8, border: "1px solid #ccc" }}
          />
          <p style={{ fontSize: 12, color: "#999", marginBottom: 16 }}>
            Deixe em branco e salve para remover a data.
          </p>

          <button
            type="submit"
            disabled={!titularId || salvando}
            style={{ padding: "10px 16px", borderRadius: 8, border: "1px solid #042f1b", background: "#042f1b", color: "#f5ead9", cursor: "pointer" }}
          >
            {salvando ? "Salvando..." : "Salvar data de inicio"}
          </button>
        </form>
      ) : null}

      {resultado ? (
        <p style={{ marginTop: 20, fontSize: 14, color: resultado.startsWith("Erro") ? "#b00" : "#042f1b" }}>
          {resultado}
        </p>
      ) : null}
    </main>
  )
}
