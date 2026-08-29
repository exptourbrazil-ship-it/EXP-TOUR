"use client";

import { useState } from "react";

// Painel administrativo para preencher os dados da aba Viagem (viagem_info) de
// cada contrato: escola, endereco, acomodacao, contato local e observacoes.
// Autenticacao pelo cookie de sessao de admin (login em /admin/login).
type ViagemInfo = {
  escola_nome: string | null;
  escola_endereco: string | null;
  acomodacao_endereco: string | null;
  contato_local_nome: string | null;
  contato_local_telefone: string | null;
  observacoes: string | null;
};

type ContratoAdmin = {
  id: string;
  nome: string | null;
  estudante_nome: string | null;
  pais_destino: string | null;
  titular_nome: string | null;
  info: ViagemInfo | null;
};

const VAZIO = {
  escolaNome: "",
  escolaEndereco: "",
  acomodacaoEndereco: "",
  contatoLocalNome: "",
  contatoLocalTelefone: "",
  observacoes: "",
};

export default function ViagemInfoClient() {
  const [contratos, setContratos] = useState<ContratoAdmin[]>([]);
  const [carregandoLista, setCarregandoLista] = useState(false);
  const [contratoId, setContratoId] = useState("");
  const [form, setForm] = useState({ ...VAZIO });
  const [salvando, setSalvando] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);

  async function carregarContratos() {
    setCarregandoLista(true);
    setResultado(null);
    try {
      const res = await fetch("/api/admin/viagem-info", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setResultado("Erro ao carregar: " + (json.erro || "falha desconhecida"));
        setContratos([]);
      } else {
        setContratos(json.contratos || []);
        if (!json.contratos || json.contratos.length === 0) {
          setResultado("Nenhum contrato encontrado.");
        }
      }
    } catch (err: any) {
      setResultado("Erro ao carregar: " + (err?.message || err));
    } finally {
      setCarregandoLista(false);
    }
  }

  function selecionarContrato(id: string) {
    setContratoId(id);
    const c = contratos.find((x) => x.id === id);
    const info = c?.info || null;
    setForm({
      escolaNome: info?.escola_nome || "",
      escolaEndereco: info?.escola_endereco || "",
      acomodacaoEndereco: info?.acomodacao_endereco || "",
      contatoLocalNome: info?.contato_local_nome || "",
      contatoLocalTelefone: info?.contato_local_telefone || "",
      observacoes: info?.observacoes || "",
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setResultado(null);
    try {
      const res = await fetch("/api/admin/viagem-info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contratoId, ...form }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setResultado("Erro: " + (json.erro || "falha desconhecida"));
      } else {
        setResultado("Dados de viagem salvos com sucesso.");
        setContratos((lista) =>
          lista.map((c) =>
            c.id === contratoId
              ? {
                  ...c,
                  info: {
                    escola_nome: form.escolaNome || null,
                    escola_endereco: form.escolaEndereco || null,
                    acomodacao_endereco: form.acomodacaoEndereco || null,
                    contato_local_nome: form.contatoLocalNome || null,
                    contato_local_telefone: form.contatoLocalTelefone || null,
                    observacoes: form.observacoes || null,
                  },
                }
              : c
          )
        );
      }
    } catch (err: any) {
      setResultado("Erro: " + (err?.message || err));
    } finally {
      setSalvando(false);
    }
  }

  const campo = (rotulo: string, chave: keyof typeof VAZIO, placeholder = "", multilinha = false) => (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: "block", fontSize: 13, marginBottom: 4 }}>{rotulo}</label>
      {multilinha ? (
        <textarea
          value={form[chave]}
          onChange={(e) => setForm((f) => ({ ...f, [chave]: e.target.value }))}
          placeholder={placeholder}
          rows={3}
          style={{ width: "100%", boxSizing: "border-box", padding: 10, borderRadius: 8, border: "1px solid #ccc", fontFamily: "inherit" }}
        />
      ) : (
        <input
          type="text"
          value={form[chave]}
          onChange={(e) => setForm((f) => ({ ...f, [chave]: e.target.value }))}
          placeholder={placeholder}
          style={{ width: "100%", boxSizing: "border-box", padding: 10, borderRadius: 8, border: "1px solid #ccc" }}
        />
      )}
    </div>
  );

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "32px 20px", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 20, margin: "0 0 8px" }}>Dados da viagem (admin)</h1>
      <p style={{ fontSize: 14, color: "#555", marginBottom: 24 }}>
        Preenche a escola, a acomodacao e o contato local que aparecem na aba
        Viagem do cliente. Selecione um contrato para carregar/editar.
      </p>

      <button
        type="button"
        onClick={carregarContratos}
        disabled={carregandoLista}
        style={{ padding: "10px 16px", borderRadius: 8, border: "1px solid var(--p-cta)", background: "var(--p-cta)", color: "var(--p-cta-fg)", cursor: "pointer", marginBottom: 24 }}
      >
        {carregandoLista ? "Carregando..." : "Carregar contratos"}
      </button>

      {contratos.length > 0 ? (
        <form onSubmit={handleSubmit}>
          <label style={{ display: "block", fontSize: 13, marginBottom: 4 }}>Contrato</label>
          <select
            value={contratoId}
            onChange={(e) => selecionarContrato(e.target.value)}
            required
            style={{ width: "100%", padding: 10, marginBottom: 16, borderRadius: 8, border: "1px solid #ccc" }}
          >
            <option value="">Selecione...</option>
            {contratos.map((c) => (
              <option key={c.id} value={c.id}>
                {(c.estudante_nome || c.titular_nome || "(sem nome)")}
                {c.pais_destino ? " - " + c.pais_destino : ""}
                {c.info ? " [preenchido]" : ""}
              </option>
            ))}
          </select>

          {contratoId ? (
            <>
              {campo("Nome da escola", "escolaNome", "Ex.: ILAC Vancouver")}
              {campo("Endereco da escola", "escolaEndereco", "Rua, numero, cidade, pais")}
              {campo("Endereco da acomodacao", "acomodacaoEndereco", "Rua, numero, cidade, pais")}
              {campo("Contato local (nome)", "contatoLocalNome", "Ex.: Host family - Maria")}
              {campo("Contato local (telefone)", "contatoLocalTelefone", "+1 ...")}
              {campo("Observacoes", "observacoes", "Informacoes extras uteis na viagem", true)}

              <button
                type="submit"
                disabled={salvando}
                style={{ padding: "10px 16px", borderRadius: 8, border: "none", background: "var(--p-accent)", color: "var(--p-ink)", fontWeight: 600, cursor: "pointer" }}
              >
                {salvando ? "Salvando..." : "Salvar dados da viagem"}
              </button>
            </>
          ) : null}
        </form>
      ) : null}

      {resultado ? <p style={{ marginTop: 16, fontSize: 14 }}>{resultado}</p> : null}
    </div>
  );
}
