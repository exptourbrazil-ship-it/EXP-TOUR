"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ContratoViagem } from "./page";
import { normalizarBusca } from "@/lib/clientes";
import { viagemPreenchida } from "@/lib/viagem";

// Editor admin dos dados da aba Viagem (viagem_info) de um contrato: escola,
// acomodacao, contato local e observacoes. Carrega no servidor; aqui o admin
// busca o contrato, edita e salva (POST em /api/admin/viagem-info, gated por
// casos.gerir). A UI espelha o RBAC: sem casos.gerir, so leitura.
const VAZIO = {
  escolaNome: "",
  escolaEndereco: "",
  acomodacaoEndereco: "",
  contatoLocalNome: "",
  contatoLocalTelefone: "",
  observacoes: "",
};

export default function ViagemInfoClient({
  contratos,
  resumo,
  podeGerir,
}: {
  contratos: ContratoViagem[];
  resumo: { total: number; preenchidos: number; pendentes: number };
  podeGerir: boolean;
}) {
  const [lista, setLista] = useState<ContratoViagem[]>(contratos);
  const [busca, setBusca] = useState("");
  const [contratoId, setContratoId] = useState("");
  const [form, setForm] = useState({ ...VAZIO });
  const [salvando, setSalvando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null);

  const filtrados = useMemo(() => {
    const termo = normalizarBusca(busca.trim());
    if (!termo) return lista;
    return lista.filter((c) =>
      normalizarBusca([c.estudante_nome, c.titular_nome, c.nome, c.pais_destino].filter(Boolean).join(" ")).includes(termo)
    );
  }, [lista, busca]);

  const selecionado = lista.find((c) => c.id === contratoId) || null;

  function selecionarContrato(id: string) {
    setContratoId(id);
    setResultado(null);
    const c = lista.find((x) => x.id === id);
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
    if (!podeGerir || !contratoId) return;
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
        setResultado({ ok: false, texto: json.erro || "Falha ao salvar." });
      } else {
        setResultado({ ok: true, texto: "Dados de viagem salvos." });
        setLista((ls) =>
          ls.map((c) =>
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
      setResultado({ ok: false, texto: err?.message || "Erro de rede." });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-golddark">Painel</p>
        <h1 className="mt-1 font-serif text-3xl text-brand">Dados da viagem</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Escola, acomodação e contato local que aparecem na aba Viagem do cliente. Selecione um
          contrato para editar.
        </p>
      </header>

      {/* Indicadores */}
      <div className="mb-6 grid grid-cols-3 gap-3">
        <CardIndicador titulo="Contratos" valor={String(resumo.total)} legenda="no total" />
        <CardIndicador titulo="Preenchidos" valor={String(resumo.preenchidos)} legenda="com dados de viagem" />
        <CardIndicador
          titulo="Pendentes"
          valor={String(resumo.pendentes)}
          legenda="sem dados"
          tom={resumo.pendentes > 0 ? "atencao" : undefined}
        />
      </div>

      {lista.length === 0 ? (
        <div className="rounded-2xl border border-neutral-200 bg-white p-6 text-center text-sm text-neutral-600">
          Nenhum contrato encontrado.
        </div>
      ) : (
        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
          {/* Busca + seletor de contrato */}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-neutral-500">Buscar (estudante, titular, programa)</span>
              <input
                type="text"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Ex.: Maria, Canadá…"
                className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-neutral-500">Contrato ({filtrados.length})</span>
              <select
                value={contratoId}
                onChange={(e) => selecionarContrato(e.target.value)}
                className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
              >
                <option value="">Selecione…</option>
                {filtrados.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.estudante_nome || c.titular_nome || "(sem nome)"}
                    {c.pais_destino ? " — " + c.pais_destino : ""}
                    {viagemPreenchida(c.info) ? " ✓" : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {selecionado ? (
            <form onSubmit={handleSubmit} className="mt-5 border-t border-neutral-100 pt-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm text-neutral-600">
                  <span className="font-medium text-brand">
                    {selecionado.estudante_nome || selecionado.titular_nome || "(sem nome)"}
                  </span>
                  {selecionado.nome ? <span className="text-neutral-400"> · {selecionado.nome}</span> : null}
                </div>
                {selecionado.titular_id ? (
                  <Link
                    href={`/admin/clientes/${selecionado.titular_id}`}
                    className="text-xs font-medium text-brand-golddark hover:underline"
                  >
                    Abrir Caso 360 →
                  </Link>
                ) : null}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Campo rotulo="Nome da escola" chave="escolaNome" form={form} setForm={setForm} disabled={!podeGerir} placeholder="Ex.: ILAC Vancouver" />
                <Campo rotulo="Endereço da escola" chave="escolaEndereco" form={form} setForm={setForm} disabled={!podeGerir} placeholder="Rua, número, cidade, país" />
                <Campo rotulo="Endereço da acomodação" chave="acomodacaoEndereco" form={form} setForm={setForm} disabled={!podeGerir} placeholder="Rua, número, cidade, país" />
                <Campo rotulo="Contato local (nome)" chave="contatoLocalNome" form={form} setForm={setForm} disabled={!podeGerir} placeholder="Ex.: Host family — Maria" />
                <Campo rotulo="Contato local (telefone)" chave="contatoLocalTelefone" form={form} setForm={setForm} disabled={!podeGerir} placeholder="+1 …" />
              </div>
              <div className="mt-4">
                <Campo rotulo="Observações" chave="observacoes" form={form} setForm={setForm} disabled={!podeGerir} placeholder="Informações extras úteis na viagem" multilinha />
              </div>

              {podeGerir ? (
                <div className="mt-5 flex items-center gap-3">
                  <button
                    type="submit"
                    disabled={salvando}
                    className="rounded-xl bg-brand px-4 py-2 text-sm font-medium text-brand-cream transition hover:opacity-90 disabled:opacity-50"
                  >
                    {salvando ? "Salvando…" : "Salvar dados da viagem"}
                  </button>
                  {resultado ? (
                    <span className={`text-xs ${resultado.ok ? "text-emerald-700" : "text-red-600"}`}>
                      {resultado.texto}
                    </span>
                  ) : null}
                </div>
              ) : (
                <p className="mt-5 text-xs text-neutral-500">
                  Seu papel não pode editar os dados de viagem (somente leitura).
                </p>
              )}
            </form>
          ) : null}
        </div>
      )}
    </div>
  );
}

function Campo({
  rotulo,
  chave,
  form,
  setForm,
  disabled,
  placeholder,
  multilinha,
}: {
  rotulo: string;
  chave: keyof typeof VAZIO;
  form: typeof VAZIO;
  setForm: React.Dispatch<React.SetStateAction<typeof VAZIO>>;
  disabled?: boolean;
  placeholder?: string;
  multilinha?: boolean;
}) {
  const comum = "w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm disabled:bg-neutral-50 disabled:text-neutral-500";
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-neutral-500">{rotulo}</span>
      {multilinha ? (
        <textarea
          value={form[chave]}
          onChange={(e) => setForm((f) => ({ ...f, [chave]: e.target.value }))}
          placeholder={placeholder}
          rows={3}
          disabled={disabled}
          className={comum}
        />
      ) : (
        <input
          type="text"
          value={form[chave]}
          onChange={(e) => setForm((f) => ({ ...f, [chave]: e.target.value }))}
          placeholder={placeholder}
          disabled={disabled}
          className={comum}
        />
      )}
    </label>
  );
}

function CardIndicador({
  titulo,
  valor,
  legenda,
  tom,
}: {
  titulo: string;
  valor: string;
  legenda?: string;
  tom?: "atencao";
}) {
  const corValor = tom === "atencao" ? "text-brand-golddark" : "text-brand";
  const corBorda = tom === "atencao" ? "border-brand-gold/40" : "border-neutral-200";
  return (
    <div className={`rounded-2xl border bg-white p-4 ${corBorda}`}>
      <p className="text-xs font-medium text-neutral-500">{titulo}</p>
      <p className={`mt-2 font-serif text-xl ${corValor}`}>{valor}</p>
      <p className="mt-1 text-xs text-neutral-400">{legenda ?? " "}</p>
    </div>
  );
}
